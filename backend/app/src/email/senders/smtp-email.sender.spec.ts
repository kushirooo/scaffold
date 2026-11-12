import type { SendMailOptions } from 'nodemailer';
import { EmailSendError } from '../email-sender.js';
import {
  SMTP_TIMEOUT_MS,
  SmtpEmailSender,
  buildSmtpTransportOptions,
  type SmtpEmailSenderOptions,
  type SmtpTransportLike,
} from './smtp-email.sender.js';

const OPTIONS: SmtpEmailSenderOptions = {
  host: 'sandbox.smtp.mailtrap.io',
  port: 587,
  user: 'mailtrap-user',
  pass: 'mailtrap-secret',
  from: 'RAF CONSULT MARS <no-reply@rafconsult.test>',
  replyTo: 'admin@rafconsult.test',
};

const MESSAGE = {
  to: 'member@rafconsult.test',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Set your password: https://portal.rafconsult.test/reset-password?token=x',
  html: '<p>Set your password</p>',
};

function recordingTransport(): {
  transport: SmtpTransportLike;
  sent: SendMailOptions[];
} {
  const sent: SendMailOptions[] = [];
  return {
    sent,
    transport: {
      async sendMail(mail: SendMailOptions): Promise<unknown> {
        sent.push(mail);
        return undefined;
      },
    },
  };
}

describe('buildSmtpTransportOptions', () => {
  it('forces STARTTLS and bounds every SMTP phase to 10 s', () => {
    expect(SMTP_TIMEOUT_MS).toBe(10_000);
    expect(buildSmtpTransportOptions(OPTIONS)).toEqual({
      host: OPTIONS.host,
      port: OPTIONS.port,
      secure: false,
      requireTLS: true,
      auth: { user: OPTIONS.user, pass: OPTIONS.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  });
});

describe('SmtpEmailSender', () => {
  it('sends both alternatives from MAIL_FROM with the admin Reply-To', async () => {
    const { transport, sent } = recordingTransport();

    await new SmtpEmailSender(OPTIONS, transport).send(MESSAGE);

    expect(sent).toEqual([
      {
        from: OPTIONS.from,
        to: MESSAGE.to,
        subject: MESSAGE.subject,
        text: MESSAGE.text,
        html: MESSAGE.html,
        replyTo: OPTIONS.replyTo,
      },
    ]);
  });

  it('lets a message override the default Reply-To', async () => {
    const { transport, sent } = recordingTransport();

    await new SmtpEmailSender(OPTIONS, transport).send({
      ...MESSAGE,
      replyTo: 'support@rafconsult.test',
    });

    expect(sent[0].replyTo).toBe('support@rafconsult.test');
  });

  it('maps a transport failure to EmailSendError without leaking the body or password', async () => {
    const failure = new Error('connect ETIMEDOUT 1.2.3.4:587');
    const transport: SmtpTransportLike = {
      async sendMail(): Promise<unknown> {
        throw failure;
      },
    };

    const caught = await new SmtpEmailSender(OPTIONS, transport)
      .send(MESSAGE)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('smtp');
    expect(sendError.providerMessage).toBe('connect ETIMEDOUT 1.2.3.4:587');
    expect(sendError.cause).toBe(failure);
    expect(sendError.statusCode).toBeUndefined();
    expect(sendError.message).not.toContain(OPTIONS.pass);
    expect(sendError.message).not.toContain(MESSAGE.html);
  });
});
