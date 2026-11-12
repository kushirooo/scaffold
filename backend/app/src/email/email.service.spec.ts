import {
  EmailSendError,
  type EmailMessage,
  type EmailSender,
} from './email-sender.js';
import { EmailService } from './email.service.js';

const MESSAGE: EmailMessage = {
  to: 'member@rafconsult.test',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Set your password: https://portal.rafconsult.test/reset-password?token=x',
  html: '<p>Set your password</p>',
};

describe('EmailService', () => {
  it('hands the rendered message to the configured adapter', async () => {
    const sent: EmailMessage[] = [];
    const sender: EmailSender = {
      async send(message: EmailMessage): Promise<void> {
        sent.push(message);
      },
    };

    await new EmailService(sender).send(MESSAGE);

    expect(sent).toEqual([MESSAGE]);
  });

  it('propagates the adapter failure unchanged for the caller to handle', async () => {
    const failure = new EmailSendError('Resend rejected the message', 'resend', {
      statusCode: 429,
    });
    const sender: EmailSender = {
      async send(): Promise<void> {
        throw failure;
      },
    };

    await expect(new EmailService(sender).send(MESSAGE)).rejects.toBe(failure);
  });
});
