import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailTransport } from '../config/env.validation.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { EmailService } from './email.service.js';
import { MemoryEmailSender } from './senders/memory-email.sender.js';
import { ResendEmailSender } from './senders/resend-email.sender.js';
import { SmtpEmailSender } from './senders/smtp-email.sender.js';

const logger = new Logger('EmailModule');

/** The slice of `ConfigService` the transport factory reads. */
export interface EmailSenderConfigSource {
  getOrThrow<T>(key: string): T;
}

function adminReplyTo(config: EmailSenderConfigSource): string | undefined {
  const recipients = config.getOrThrow<string[]>('ADMIN_ALERT_EMAILS');
  return recipients.at(0);
}

/**
 * Builds the adapter named by the validated `EMAIL_TRANSPORT`. Environment
 * validation has already rejected an unknown transport and a missing SMTP or
 * Resend credential, so a misconfiguration fails at boot, not at send time.
 */
export function createEmailSender(config: EmailSenderConfigSource): EmailSender {
  const transport = config.getOrThrow<EmailTransport>('EMAIL_TRANSPORT');
  const from = config.getOrThrow<string>('MAIL_FROM');
  const replyTo = adminReplyTo(config);

  switch (transport) {
    case 'memory':
      if (config.getOrThrow<string>('NODE_ENV') !== 'test') {
        logger.warn(
          'EMAIL_TRANSPORT=memory: messages are recorded in-process and not delivered',
        );
      }
      return new MemoryEmailSender();

    case 'smtp':
      return new SmtpEmailSender({
        host: config.getOrThrow<string>('SMTP_HOST'),
        port: config.getOrThrow<number>('SMTP_PORT'),
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
        from,
        replyTo,
      });

    case 'resend':
      return new ResendEmailSender({
        apiKey: config.getOrThrow<string>('RESEND_API_KEY'),
        from,
        replyTo,
      });

    default: {
      // Unreachable while validation runs; kept so a new transport cannot fall
      // through silently to an undefined sender.
      const unreachable: never = transport;
      throw new Error(`Unsupported EMAIL_TRANSPORT: ${String(unreachable)}`);
    }
  }
}

/**
 * US18/US19 email transport. Feature modules import this module and inject
 * `EmailService`; `EMAIL_SENDER` is exported so tests and local tooling can
 * swap the adapter or inspect the in-memory outbox.
 */
@Module({
  providers: [
    EmailService,
    {
      provide: EMAIL_SENDER,
      useFactory: createEmailSender,
      inject: [ConfigService],
    },
  ],
  exports: [EmailService, EMAIL_SENDER],
})
export class EmailModule {}
