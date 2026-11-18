import { Logger } from '@nestjs/common';
import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from '../email-sender.js';
import { buildGmailRawMessage } from '../gmail-mime.js';

/**
 * Gmail API transport (ADR 0005): OAuth 2.0 user credentials over HTTPS, no
 * SDK. Deployed backends (Railway/Render) block outbound SMTP, so this adapter
 * trades the SMTP socket for the same HTTPS path the rest of the app uses.
 */
export const GMAIL_TIMEOUT_MS = 10_000;
export const GMAIL_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GMAIL_SEND_ENDPOINT =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
/** Explicit UA: Google edge protection prefers identifiable non-bare clients. */
export const GMAIL_USER_AGENT = 'RAF-Consult-PMS/1.0';

export interface GmailEmailSenderOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Authorised Gmail account; becomes the From address. */
  sender: string;
  /** Display name for the From header. */
  fromName: string;
  /** Default Reply-To; the admin alert address. */
  replyTo?: string;
}

export interface GmailRequest {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

/** The subset of a fetch response this adapter reads. */
export interface GmailResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/** The fetch surface this adapter uses, so tests can pass a fake. */
export type GmailHttpClient = (
  url: string,
  request: GmailRequest,
) => Promise<GmailResponse>;

interface CachedAccessToken {
  value: string;
  /** Epoch milliseconds; refresh happens one minute before this. */
  expiresAt: number;
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Extracts a safe provider message from Gmail/OAuth error bodies. */
function providerMessageFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  const error = record.error;

  if (typeof error === 'string') {
    const description =
      typeof record.error_description === 'string'
        ? record.error_description
        : undefined;
    return [error, description].filter(Boolean).join(': ') || undefined;
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  if (typeof record.message === 'string') {
    return record.message;
  }

  return undefined;
}

async function readProviderMessage(
  response: GmailResponse,
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

export class GmailEmailSender implements EmailSender {
  private readonly logger = new Logger(GmailEmailSender.name);
  private accessToken?: CachedAccessToken;
  private refreshInFlight?: Promise<string>;

  constructor(
    private readonly options: GmailEmailSenderOptions,
    private readonly client: GmailHttpClient = (url, request) =>
      fetch(url, request),
    private readonly now: () => number = Date.now,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let raw: string;
    try {
      raw = buildGmailRawMessage({
        sender: this.options.sender,
        fromName: this.options.fromName,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo ?? this.options.replyTo,
      });
    } catch (error) {
      throw new EmailSendError('Gmail message could not be built', 'gmail-api', {
        providerMessage: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }

    let response = await this.sendRaw(raw, await this.getAccessToken());

    // An expired/revoked access token is recoverable: drop the cache, refresh
    // once and retry the same message. Every other failure is final for
    // Sprint 1 (no queue, no retry loop — ADR 0004).
    if (response.status === 401) {
      this.accessToken = undefined;
      response = await this.sendRaw(raw, await this.getAccessToken());
    }

    if (response.ok) {
      return;
    }

    const providerMessage = await readProviderMessage(response);
    if (response.status === 429) {
      // Only provider + status: never the recipient or the rendered body.
      this.logger.warn({
        event: 'email_provider_rate_limited',
        provider: 'gmail-api',
        statusCode: response.status,
      });
    }

    throw new EmailSendError(
      `Gmail rejected the message with status ${response.status}`,
      'gmail-api',
      { statusCode: response.status, providerMessage },
    );
  }

  private async sendRaw(
    raw: string,
    accessToken: string,
  ): Promise<GmailResponse> {
    try {
      return await this.client(GMAIL_SEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': GMAIL_USER_AGENT,
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailSendError('Gmail send request failed', 'gmail-api', {
        providerMessage: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > this.now()) {
      return this.accessToken.value;
    }

    // Concurrent sends must not stampede the token endpoint.
    const pending = this.refreshInFlight ?? this.refreshAccessToken();
    this.refreshInFlight = pending;
    try {
      return await pending;
    } finally {
      if (this.refreshInFlight === pending) {
        this.refreshInFlight = undefined;
      }
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      refresh_token: this.options.refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    let response: GmailResponse;
    try {
      response = await this.client(GMAIL_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': GMAIL_USER_AGENT,
        },
        body,
        signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailSendError(
        'Gmail OAuth token request failed',
        'gmail-api',
        {
          providerMessage: error instanceof Error ? error.message : undefined,
          cause: error,
        },
      );
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new EmailSendError(
        `Gmail OAuth token request failed with status ${response.status}`,
        'gmail-api',
        {
          statusCode: response.status,
          providerMessage:
            providerMessageFrom(payload) ?? (response.statusText || undefined),
        },
      );
    }

    const record =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
    const accessToken = record.access_token;
    const expiresIn = record.expires_in;

    if (
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new EmailSendError(
        'Gmail OAuth token response was invalid',
        'gmail-api',
      );
    }

    this.accessToken = {
      value: accessToken,
      expiresAt:
        this.now() + expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS,
    };
    return accessToken;
  }
}
