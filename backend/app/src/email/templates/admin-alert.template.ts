import type { UserRole } from '../../users/user.types.js';
import {
  type RenderedEmail,
  headerSafe,
  renderDetail,
  renderHeading,
  renderLayout,
  renderParagraph,
  renderTextFooter,
} from './render.js';

/** Prefix required by SPRINT1_PLAN.md §8.4; the recipient email is appended. */
export const ADMIN_ALERT_SUBJECT_PREFIX = '[MARS] Welcome email failed for ';

export interface AdminAlertEmailInput {
  userId: string;
  email: string;
  role: UserRole;
  errorName: string;
  errorMessage: string;
  occurredAt: Date;
  correlationId: string;
}

/**
 * Best-effort admin alert for a failed welcome email. It carries identifiers
 * and the failure only: never a password, hash or invite token. The subject is
 * the one header built from data, so CR/LF are stripped from the email.
 */
export function renderAdminAlertEmail(
  input: AdminAlertEmailInput,
): RenderedEmail {
  const subject = `${ADMIN_ALERT_SUBJECT_PREFIX}${headerSafe(input.email)}`;
  const occurredAt = input.occurredAt.toISOString();

  const bodyHtml = [
    renderHeading('Welcome email failed'),
    renderParagraph(
      'The welcome email for a newly created account could not be sent.',
    ),
    renderParagraph(
      'The account exists: it was created successfully before the email was sent, so no account data was lost.',
    ),
    renderDetail('User ID', input.userId),
    renderDetail('Email', input.email),
    renderDetail('Role', input.role),
    renderDetail('Error class', input.errorName),
    renderDetail('Error message', input.errorMessage),
    renderDetail('Occurred at', occurredAt),
    renderDetail('Correlation ID', input.correlationId),
    renderParagraph(
      'If the user reports not receiving the email, re-issue the invite or reset their password from the portal.',
    ),
  ].join('\n');

  const text = [
    'Welcome email failed',
    '',
    'The welcome email for a newly created account could not be sent.',
    '',
    'The account exists: it was created successfully before the email was sent, so no account data was lost.',
    '',
    `User ID: ${input.userId}`,
    `Email: ${input.email}`,
    `Role: ${input.role}`,
    `Error class: ${input.errorName}`,
    `Error message: ${input.errorMessage}`,
    `Occurred at: ${occurredAt}`,
    `Correlation ID: ${input.correlationId}`,
    '',
    'If the user reports not receiving the email, re-issue the invite or reset their password from the portal.',
    '',
    renderTextFooter(),
    '',
  ].join('\n');

  return {
    subject,
    text,
    html: renderLayout({
      title: subject,
      bodyHtml,
    }),
  };
}

/** US19: reset-token/email failures are alerted to the admins, best effort. */
export const RESET_EMAIL_FAILED_SUBJECT_PREFIX =
  '[MARS] Password reset email failed for ';

/** Mirrors `PasswordResetStage` in `password-recovery.service.ts`. */
export type ResetEmailAlertStage = 'token' | 'send';

export interface ResetEmailAlertInput {
  userId: string;
  email: string;
  stage: ResetEmailAlertStage;
  errorName: string;
  errorMessage: string;
  occurredAt: Date;
}

function resetStageLabel(stage: ResetEmailAlertStage): string {
  return stage === 'token'
    ? 'Issuing the reset token'
    : 'Sending the reset email';
}

/**
 * Best-effort admin alert for a failed US19 reset token/email. It carries
 * identifiers and the failure only: never a password, hash, raw token or reset
 * URL (ADR 0004). The subject is the one header built from data, so CR/LF are
 * stripped from the email.
 */
export function renderResetEmailAlert(
  input: ResetEmailAlertInput,
): RenderedEmail {
  const subject = `${RESET_EMAIL_FAILED_SUBJECT_PREFIX}${headerSafe(input.email)}`;
  const occurredAt = input.occurredAt.toISOString();
  const stage = resetStageLabel(input.stage);

  const bodyHtml = [
    renderHeading('Password reset email failed'),
    renderParagraph(
      'A password reset request could not be completed for an active account.',
    ),
    renderParagraph(
      'The account exists and is unchanged. The reset link was not delivered; the user can request another one.',
    ),
    renderDetail('User ID', input.userId),
    renderDetail('Email', input.email),
    renderDetail('Failed stage', stage),
    renderDetail('Error class', input.errorName),
    renderDetail('Error message', input.errorMessage),
    renderDetail('Occurred at', occurredAt),
  ].join('\n');

  const text = [
    'Password reset email failed',
    '',
    'A password reset request could not be completed for an active account.',
    '',
    'The account exists and is unchanged. The reset link was not delivered; the user can request another one.',
    '',
    `User ID: ${input.userId}`,
    `Email: ${input.email}`,
    `Failed stage: ${stage}`,
    `Error class: ${input.errorName}`,
    `Error message: ${input.errorMessage}`,
    `Occurred at: ${occurredAt}`,
    '',
    renderTextFooter(),
    '',
  ].join('\n');

  return {
    subject,
    text,
    html: renderLayout({
      title: subject,
      bodyHtml,
    }),
  };
}
