import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service.js';
import { renderResetEmailAlert } from '../email/templates/admin-alert.template.js';
import { renderResetEmail } from '../email/templates/reset.template.js';
import type { User } from '../users/user.types.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import {
  INVALID_CREDENTIALS_MESSAGE,
  RESET_LINK_INVALID_MESSAGE,
  type AccessTokenPayload,
  type AuthenticatedUser,
  type ChangePasswordResponse,
} from './auth.types.js';
import { PasswordHasher } from './password-hasher.js';
import {
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_WINDOW_MS,
  ForgotPasswordRateLimiter,
  waitForForgotPasswordResponseFloor,
} from './forgot-password-rate-limiter.js';
import { passwordPolicyViolation } from './password-policy.js';
import {
  PASSWORD_RECOVERY_REPOSITORY,
  type PasswordRecoveryRepository,
} from './password-recovery.repository.js';
import { ResetTokenService } from './reset-token.service.js';

/**
 * Where the forgot-password failure happened: issuing the RESET token, or
 * sending the mail. Reported in the log and the admin alert.
 */
export type PasswordResetStage = 'token' | 'send';

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A transport error message is untrusted text: providers may echo the rendered
 * email, including its reset link. Strip complete reset URLs and 43+ character
 * base64url token-shaped strings before the text can reach a log or the admin
 * alert, so "the alert never contains the token" does not depend on adapter
 * discipline. The error class and stage are still reported for diagnosis.
 */
const RESET_URL_TEXT =
  /https?:\/\/[^\s"'<>]*\/reset-password\?token=[^\s"'<>]+/gi;
const TOKEN_SHAPED_TEXT = /[A-Za-z0-9_-]{43,}/g;

function redactResetSecrets(value: string): string {
  return value
    .replace(RESET_URL_TEXT, '[redacted reset link]')
    .replace(TOKEN_SHAPED_TEXT, '[redacted token]');
}

/**
 * US19 password recovery: the forgot half (T3), the reset half (T4) and, in T5,
 * the authenticated change-password path. Token issuance/hashing stays in
 * `ResetTokenService`; the atomic multi-table writes live in
 * `PasswordRecoveryRepository`.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly frontendUrl: string;
  private readonly adminAlertEmails: string[];
  private readonly mailFrom: string;
  private readonly ttlSeconds: number;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly tokens: ResetTokenService,
    private readonly email: EmailService,
    private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_RECOVERY_REPOSITORY)
    private readonly recovery: PasswordRecoveryRepository,
    private readonly rateLimiter: ForgotPasswordRateLimiter,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    this.ttlSeconds = config.getOrThrow<number>('JWT_TTL_SECONDS');
    this.adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
    this.mailFrom = config.getOrThrow<string>('MAIL_FROM');
  }

  /**
   * US19 §9.1: always resolves. Unknown and inactive accounts are a silent
   * no-op, so the endpoint cannot be used to enumerate accounts. Token-issue
   * and email-send failures are logged and alerted, never rethrown.
   *
   * Two anti-enumeration gates wrap the work: repeated attempts for one
   * normalised address are counted (over-limit attempts stay a `204` no-op with
   * no email and no lookup), and every branch — known, unknown, failed — waits
   * out the same minimum response duration so response time does not leak
   * account existence.
   */
  async forgotPassword(email: string): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.processForgotPassword(email.trim().toLowerCase());
    } finally {
      await waitForForgotPasswordResponseFloor(startedAt);
    }
  }

  private async processForgotPassword(normalisedEmail: string): Promise<void> {
    if (this.rateLimiter.record(normalisedEmail) === 'limited') {
      // Structured event with neither the address nor a token; the response is
      // still 204 and no email is sent, exactly like the unknown-account path.
      this.logger.warn({
        event: 'forgot_password_rate_limited',
        windowLimit: FORGOT_PASSWORD_RATE_LIMIT,
        windowMs: FORGOT_PASSWORD_RATE_WINDOW_MS,
      });
      return;
    }

    const user = await this.users.findActiveByEmail(normalisedEmail);

    if (!user) {
      return;
    }

    let stage: PasswordResetStage = 'token';

    try {
      const { rawToken } = await this.tokens.issueReset(user.id);
      stage = 'send';
      await this.sendResetEmail(user, rawToken);
    } catch (error) {
      // Reporting is itself best-effort: nothing here may escape the handler.
      try {
        await this.reportFailure(user, stage, error);
      } catch {
        // Last resort: the forgot-password request must still return 204.
      }
    }
  }

  /**
   * US19 §9.1: reset a password from a single-use RESET or INVITE link.
   *
   * Order matters: the link is validated first and every failure produces the
   * same generic 400, so nothing distinguishes expired, used, unknown,
   * wrong-purpose or inactive-user links. The policy is checked before any
   * consumption, and the expensive argon2 hash runs outside the transaction,
   * which starts only once the new credential is ready.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.tokens.findByRawToken(rawToken);
    const now = new Date();

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime() ||
      (record.purpose !== 'RESET' && record.purpose !== 'INVITE')
    ) {
      throw new BadRequestException(RESET_LINK_INVALID_MESSAGE);
    }

    const user = await this.users.findById(record.userId);
    if (!user || !user.isActive) {
      throw new BadRequestException(RESET_LINK_INVALID_MESSAGE);
    }

    // Defence in depth for direct service callers; the DTO already rejects a
    // policy-violating password before the controller runs.
    const violation = passwordPolicyViolation(newPassword);
    if (violation) {
      throw new BadRequestException(violation.message);
    }

    // CPU-heavy argon2 deliberately outside the DB transaction.
    const passwordHash = await this.hasher.hash(newPassword);

    const consumed = await this.recovery.resetPassword({
      tokenHash: record.tokenHash,
      userId: record.userId,
      passwordHash,
    });

    if (!consumed) {
      // The conditional consume lost the race with another request (or the
      // account changed after the read); exactly one concurrent reset wins.
      throw new BadRequestException(RESET_LINK_INVALID_MESSAGE);
    }
  }


  /**
   * US19 §7.7 authenticated password change.
   *
   * The current password is checked with the same generic 401 as login and the
   * policy is applied before any write. The transaction then rotates the
   * credential, bumps `tokenVersion`, revokes every session, creates exactly
   * one replacement session and invalidates unused reset/invite links. The new
   * JWT is returned separately so the controller can put it in the httpOnly
   * cookie; it never enters the response body.
   */
  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ token: string; response: ChangePasswordResponse }> {
    const account = await this.users.findByEmail(user.email);
    if (!account || !account.isActive || account.id !== user.id) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const currentMatches = await this.hasher.verify(
      account.passwordHash,
      currentPassword,
    );
    if (!currentMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Defence in depth for direct service callers; the DTO rejects first.
    const violation = passwordPolicyViolation(newPassword);
    if (violation) {
      throw new BadRequestException(violation.message);
    }

    // CPU-heavy argon2 deliberately outside the DB transaction.
    const passwordHash = await this.hasher.hash(newPassword);
    const rotated = await this.recovery.changePassword({
      userId: account.id,
      passwordHash,
      session: {
        id: randomUUID(),
        expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
      },
    });

    const payload: AccessTokenPayload = {
      sub: account.id,
      sid: rotated.session.id,
      tv: rotated.tokenVersion,
      role: account.role,
      email: account.email,
    };
    const token = await this.jwt.signAsync(payload, {
      expiresIn: this.ttlSeconds,
    });

    return {
      token,
      response: {
        user: {
          id: account.id,
          email: account.email,
          fullName: account.fullName,
          role: account.role,
        },
        expiresIn: this.ttlSeconds,
      },
    };
  }

  private async sendResetEmail(user: User, rawToken: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    // Rendered inside the try block on purpose: the raw token only lives in the
    // email link, never in a log, the alert or the response (ADR 0004).
    const rendered = renderResetEmail({
      fullName: user.fullName,
      resetUrl,
      expiresInMinutes: Math.ceil(this.tokens.resetTtlSeconds / 60),
      fromAddress: this.mailFrom,
    });

    await this.email.send({ to: user.email, ...rendered });
  }

  private async reportFailure(
    user: User,
    stage: PasswordResetStage,
    error: unknown,
  ): Promise<void> {
    const errorName = errorNameOf(error);
    const errorMessage = redactResetSecrets(errorMessageOf(error));

    try {
      this.logger.error({
        event: 'password_reset_email_failed',
        stage,
        userId: user.id,
        email: user.email,
        errorName,
      });
    } catch {
      // Logging must never break the failure path.
    }

    try {
      const alert = renderResetEmailAlert({
        userId: user.id,
        email: user.email,
        stage,
        errorName,
        errorMessage,
        occurredAt: new Date(),
      });
      // Exactly one attempt, no retry and no recursion.
      await this.email.send({ to: this.adminAlertEmails, ...alert });
    } catch (alertError) {
      try {
        this.logger.error({
          event: 'password_reset_admin_alert_failed',
          userId: user.id,
          errorName: errorNameOf(alertError),
        });
      } catch {
        // Same rule: the alert failure is logged and the chain stops here.
      }
    }
  }
}
