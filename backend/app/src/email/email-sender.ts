import type { EmailTransport } from '../config/env.validation.js';

/** Injection token for the transport adapter chosen from `EMAIL_TRANSPORT`. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export type EmailProvider = EmailTransport;

/**
 * A fully rendered message. Both alternatives are required: every US18/US19
 * message is plain text with an HTML copy (SPRINT1_PLAN.md §10.5).
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

/** Contract every transport adapter implements. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailSendErrorDetails {
  /** HTTP status from an HTTP provider; absent for SMTP failures. */
  statusCode?: number;
  /** Provider-supplied error text. Never the rendered body or credentials. */
  providerMessage?: string;
  cause?: unknown;
}

/**
 * Typed failure raised by every adapter, so the failure handler can log one
 * error name without knowing which transport is configured. The message is
 * deliberately generic: bodies, tokens and credentials never reach it.
 */
export class EmailSendError extends Error {
  readonly provider: EmailProvider;
  readonly statusCode?: number;
  readonly providerMessage?: string;

  constructor(
    message: string,
    provider: EmailProvider,
    details: EmailSendErrorDetails = {},
  ) {
    super(message, { cause: details.cause });
    this.name = 'EmailSendError';
    this.provider = provider;
    this.statusCode = details.statusCode;
    this.providerMessage = details.providerMessage;
  }
}
