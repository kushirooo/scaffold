import { MemoryEmailSender } from './memory-email.sender.js';

const MESSAGE = {
  to: 'member@rafconsult.test',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Set your password: https://portal.rafconsult.test/reset-password?token=x',
  html: '<p>Set your password</p>',
};

describe('MemoryEmailSender', () => {
  it('records every message in send order', async () => {
    const sender = new MemoryEmailSender();

    await sender.send(MESSAGE);
    await sender.send({ ...MESSAGE, subject: 'second' });

    expect(sender.messages.map((message) => message.subject)).toEqual([
      MESSAGE.subject,
      'second',
    ]);
  });

  it('stores copies so later mutation cannot rewrite the outbox', async () => {
    const sender = new MemoryEmailSender();
    const recipients = ['member@rafconsult.test'];

    await sender.send({ ...MESSAGE, to: recipients });
    recipients.push('other@rafconsult.test');

    expect(sender.messages[0].to).toEqual(['member@rafconsult.test']);
  });

  it('clears the outbox', async () => {
    const sender = new MemoryEmailSender();
    await sender.send(MESSAGE);

    sender.clear();

    expect(sender.messages).toEqual([]);
  });
});
