import { Logger } from '@nestjs/common';
import {
  type EmailSenderConfigSource,
  createEmailSender,
} from './email.module.js';
import { MemoryEmailSender } from './senders/memory-email.sender.js';
import { ResendEmailSender } from './senders/resend-email.sender.js';
import { SmtpEmailSender } from './senders/smtp-email.sender.js';

const BASE_CONFIG = {
  NODE_ENV: 'test',
  MAIL_FROM: 'RAF CONSULT MARS <no-reply@rafconsult.test>',
  ADMIN_ALERT_EMAILS: ['admin@rafconsult.test'],
};

function configSource(values: Record<string, unknown>): EmailSenderConfigSource {
  return {
    getOrThrow<T>(key: string): T {
      if (!(key in values)) {
        throw new Error(`missing configuration: ${key}`);
      }
      return values[key] as T;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createEmailSender', () => {
  it('chooses the memory adapter for EMAIL_TRANSPORT=memory', () => {
    const sender = createEmailSender(
      configSource({ ...BASE_CONFIG, EMAIL_TRANSPORT: 'memory' }),
    );

    expect(sender).toBeInstanceOf(MemoryEmailSender);
  });

  it('chooses the SMTP adapter and requires its credentials', () => {
    const config = configSource({
      ...BASE_CONFIG,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'sandbox.smtp.mailtrap.io',
      SMTP_PORT: 587,
      SMTP_USER: 'mailtrap-user',
      SMTP_PASS: 'mailtrap-secret',
    });

    expect(createEmailSender(config)).toBeInstanceOf(SmtpEmailSender);
    expect(() =>
      createEmailSender(
        configSource({
          ...BASE_CONFIG,
          EMAIL_TRANSPORT: 'smtp',
          SMTP_HOST: 'sandbox.smtp.mailtrap.io',
          SMTP_PORT: 587,
          SMTP_USER: 'mailtrap-user',
        }),
      ),
    ).toThrow('missing configuration: SMTP_PASS');
  });

  it('chooses the Resend adapter and requires its API key', () => {
    expect(() =>
      createEmailSender(
        configSource({ ...BASE_CONFIG, EMAIL_TRANSPORT: 'resend' }),
      ),
    ).toThrow('missing configuration: RESEND_API_KEY');

    expect(
      createEmailSender(
        configSource({
          ...BASE_CONFIG,
          EMAIL_TRANSPORT: 'resend',
          RESEND_API_KEY: 'resend-secret-key',
        }),
      ),
    ).toBeInstanceOf(ResendEmailSender);
  });

  it('warns when memory is used outside tests', () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    createEmailSender(
      configSource({
        ...BASE_CONFIG,
        NODE_ENV: 'development',
        EMAIL_TRANSPORT: 'memory',
      }),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('EMAIL_TRANSPORT=memory'),
    );
  });

  it('rejects an unknown transport instead of returning an undefined sender', () => {
    expect(() =>
      createEmailSender(
        configSource({ ...BASE_CONFIG, EMAIL_TRANSPORT: 'pigeon' }),
      ),
    ).toThrow('Unsupported EMAIL_TRANSPORT: pigeon');
  });
});
