import { Logger } from '@nestjs/common';
import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from '../email-sender.js';

/** ADR 0004 (D8): Resend REST endpoint, no SDK dependency. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
/** §10.3: every provider call is bounded to 10 s. */
export const RESEND_TIMEOUT_MS = 10_000;

export interface ResendEmailSenderOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface ResendRequest {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

/** The subset of a fetch response this adapter reads. */
export interface ResendResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/** The fetch surface this adapter uses, so tests can pass a fake. */
export type ResendHttpClient = (
  url: string,
  request: ResendRequest,
) => Promise<ResendResponse>;

function providerMessageFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined;
  }

  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return (
      message.filter((part): part is string => typeof part === 'string').join('; ') ||
      undefined
    );
  }
  return undefined;
}

async function readProviderMessage(
  response: ResendResponse,
): Promise<string | undefined> {
  try {
    const message = providerMessageFrom(await response.json());
    if (message) {
      return message;
    }
  } catch {
    // A non-JSON error body carries nothing actionable; use the status text.
  }
  return response.statusText || undefined;
}

export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(
    private readonly options: ResendEmailSenderOptions,
    private readonly client: ResendHttpClient = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const replyTo = message.replyTo ?? this.options.replyTo;
    const payload = {
      from: this.options.from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    let response: ResendResponse;
    try {
      response = await this.client(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailSendError('Resend request failed', 'resend', {
        providerMessage: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }

    if (response.ok) {
      return;
    }

    const providerMessage = await readProviderMessage(response);
    if (response.status === 429) {
      // ADR 0004: a rate limit is logged once and never retried in Sprint 1.
      // Only the provider and status are logged — never the recipient or body.
      this.logger.warn({
        event: 'email_provider_rate_limited',
        provider: 'resend',
        statusCode: response.status,
      });
    }

    throw new EmailSendError(
      `Resend rejected the message with status ${response.status}`,
      'resend',
      { statusCode: response.status, providerMessage },
    );
  }
}
