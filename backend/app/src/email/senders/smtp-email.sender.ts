import {
  createTransport,
  type SMTPTransportOptions,
  type SendMailOptions,
} from 'nodemailer';
import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from '../email-sender.js';

/** ADR 0004 (D7): every SMTP phase is bounded to 10 s. */
export const SMTP_TIMEOUT_MS = 10_000;

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Envelope From, taken from MAIL_FROM so dev and staging match. */
  from: string;
  /** Default Reply-To; the admin alert address. */
  replyTo?: string;
}

/** The nodemailer surface this adapter uses, so tests can pass a fake. */
export interface SmtpTransportLike {
  sendMail(mail: SendMailOptions): Promise<unknown>;
}

/**
 * Transport options fixed by ADR 0004 (D7): explicit STARTTLS (`secure: false`,
 * `requireTLS: true`) rather than implicit TLS, plus 10 s connection, greeting
 * and socket timeouts so a dead provider cannot hang the request.
 */
export function buildSmtpTransportOptions(
  options: SmtpEmailSenderOptions,
): SMTPTransportOptions {
  return {
    host: options.host,
    port: options.port,
    secure: false,
    requireTLS: true,
    auth: { user: options.user, pass: options.pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  };
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport: SmtpTransportLike;

  constructor(
    private readonly options: SmtpEmailSenderOptions,
    transport?: SmtpTransportLike,
  ) {
    this.transport =
      transport ?? createTransport(buildSmtpTransportOptions(options));
  }

  async send(message: EmailMessage): Promise<void> {
    const replyTo = message.replyTo ?? this.options.replyTo;
    const mail: SendMailOptions = {
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(replyTo ? { replyTo } : {}),
    };

    try {
      await this.transport.sendMail(mail);
    } catch (error) {
      throw new EmailSendError('SMTP send failed', 'smtp', {
        providerMessage: error instanceof Error ? error.message : undefined,
        cause: error,
      });
    }
  }
}
