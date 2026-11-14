import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service.js';
import { renderResetEmailAlert } from '../email/templates/admin-alert.template.js';
import { renderResetEmail } from '../email/templates/reset.template.js';
import type { User } from '../users/user.types.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
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
 * US19 password recovery. This file grows in T4 (reset) and T5 (change); for
 * now it owns the forgot half only.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly frontendUrl: string;
  private readonly adminAlertEmails: string[];
  private readonly mailFrom: string;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly tokens: ResetTokenService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    this.adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
    this.mailFrom = config.getOrThrow<string>('MAIL_FROM');
  }

  /**
   * US19 §9.1: always resolves. Unknown and inactive accounts are a silent
   * no-op, so the endpoint cannot be used to enumerate accounts. Token-issue
   * and email-send failures are logged and alerted, never rethrown.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findActiveByEmail(email);

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

  private async sendResetEmail(user: User, rawToken: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    // Rendered inside the try block on purpose: the raw token only lives in the
    // email link, never in a log, the alert or the response (ADR 0004).
    const rendered = renderResetEmail({
      fullName: user.fullName,
      resetUrl,
      expiresInMinutes: this.tokens.resetTtlSeconds / 60,
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
        errorMessage: errorMessageOf(error),
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
