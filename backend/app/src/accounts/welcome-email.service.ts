import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResetTokenService } from '../auth/reset-token.service.js';
import { EmailService } from '../email/email.service.js';
import { renderAdminAlertEmail } from '../email/templates/admin-alert.template.js';
import { renderWelcomeEmail } from '../email/templates/welcome.template.js';
import type { AccountCreatedPayload } from './account-events.js';

/** Where the failure happened: issuing the INVITE token, or sending the mail. */
export type WelcomeEmailStage = 'token' | 'send';

export interface WelcomeEmailResult {
  status: 'sent' | 'failed';
  stage?: WelcomeEmailStage;
}

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * US18 handler for the `account.created` seam. It is deliberately public so
 * US02 can call it directly after commit as well as through the event listener;
 * both paths run this one method.
 *
 * It never throws and never rethrows. A send or token failure is logged, one
 * best-effort admin alert is attempted, and the account (committed by US02
 * before this runs) is unaffected.
 */
@Injectable()
export class WelcomeEmailService {
  private readonly logger = new Logger(WelcomeEmailService.name);
  private readonly frontendUrl: string;
  private readonly adminAlertEmails: string[];
  private readonly mailFrom: string;
  private readonly inviteTtlSeconds: number;

  constructor(
    private readonly tokens: ResetTokenService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    this.adminAlertEmails = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
    this.mailFrom = config.getOrThrow<string>('MAIL_FROM');
    this.inviteTtlSeconds =
      config.getOrThrow<number>('INVITE_TTL_SECONDS');
  }

  async handleAccountCreated(
    payload: AccountCreatedPayload,
  ): Promise<WelcomeEmailResult> {
    let stage: WelcomeEmailStage = 'token';

    try {
      const { rawToken } = await this.tokens.issueInvite(payload.userId);
      stage = 'send';
      await this.sendWelcomeEmail(payload, rawToken);
      return { status: 'sent' };
    } catch (error) {
      // Reporting is itself best-effort: nothing here may escape the handler.
      try {
        await this.reportFailure(payload, stage, error);
      } catch {
        // Last resort: the failure path must not reject the caller either.
      }
      return { status: 'failed', stage };
    }
  }

  private async sendWelcomeEmail(
    payload: AccountCreatedPayload,
    rawToken: string,
  ): Promise<void> {
    const activationUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const loginUrl = `${this.frontendUrl}/login`;
    const rendered = renderWelcomeEmail({
      fullName: payload.fullName,
      role: payload.role,
      loginUrl,
      activationUrl,
      expiresInHours: this.inviteTtlSeconds / 3600,
      fromAddress: this.mailFrom,
    });

    await this.email.send({ to: payload.email, ...rendered });
  }

  private async reportFailure(
    payload: AccountCreatedPayload,
    stage: WelcomeEmailStage,
    error: unknown,
  ): Promise<void> {
    const errorName = errorNameOf(error);

    try {
      this.logger.error({
        event: 'welcome_email_failed',
        stage,
        userId: payload.userId,
        email: payload.email,
        errorName,
        correlationId: payload.correlationId,
      });
    } catch {
      // Logging must never break the failure path.
    }

    try {
      const alert = renderAdminAlertEmail({
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        errorName,
        errorMessage: errorMessageOf(error),
        occurredAt: new Date(),
        correlationId: payload.correlationId,
      });
      // Exactly one attempt, no retry and no recursion (ADR 0004 §4).
      await this.email.send({ to: this.adminAlertEmails, ...alert });
    } catch (alertError) {
      try {
        this.logger.error({
          event: 'welcome_email_admin_alert_failed',
          userId: payload.userId,
          correlationId: payload.correlationId,
          errorName: errorNameOf(alertError),
        });
      } catch {
        // Same rule: the alert failure is logged and the chain stops here.
      }
    }
  }
}
