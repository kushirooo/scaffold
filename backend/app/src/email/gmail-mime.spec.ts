import { buildGmailRawMessage } from './gmail-mime.js';
import { parseMailbox, stripHeaderNewlines } from './mailbox.js';

const FIXED_DATE = new Date('2026-11-18T02:00:00.000Z');

const BASE_MESSAGE = {
  sender: 'rafconsultpms@gmail.com',
  fromName: 'RAF Consult PMS',
  to: 'demo.member@gmail.com',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Welcome.\n\nSet your password: https://portal.example/reset?token=x',
  html: '<p>Welcome.</p>',
  date: FIXED_DATE,
};

function decodeRaw(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

describe('parseMailbox', () => {
  it('parses a display-name address', () => {
    expect(parseMailbox('RAF Consult PMS <rafconsultpms@gmail.com>')).toEqual({
      email: 'rafconsultpms@gmail.com',
      name: 'RAF Consult PMS',
    });
  });

  it('parses a quoted display-name address', () => {
    expect(parseMailbox('"RAF, PMS" <rafconsultpms@gmail.com>')).toEqual({
      email: 'rafconsultpms@gmail.com',
      name: 'RAF, PMS',
    });
  });

  it('parses a bare address', () => {
    expect(parseMailbox('  rafconsultpms@gmail.com  ')).toEqual({
      email: 'rafconsultpms@gmail.com',
    });
  });

  it('strips CR/LF from every value', () => {
    expect(stripHeaderNewlines('a\r\nBcc: evil@example.com')).toBe(
      'a Bcc: evil@example.com',
    );
  });
});

describe('buildGmailRawMessage', () => {
  it('builds a base64url multipart/alternative message with both parts', () => {
    const raw = buildGmailRawMessage(BASE_MESSAGE);
    const mime = decodeRaw(raw);

    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(mime).toContain(
      'Content-Type: multipart/alternative; boundary="----=_MARS_',
    );
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');

    const plainPart = mime.split('Content-Type: text/plain')[1].split('--')[0];
    const plainBody = plainPart.split('\r\n\r\n')[1];
    expect(Buffer.from(plainBody.replace(/\r\n/g, ''), 'base64').toString()).toBe(
      BASE_MESSAGE.text,
    );

    const htmlPart = mime.split('Content-Type: text/html')[1].split('--')[0];
    const htmlBody = htmlPart.split('\r\n\r\n')[1];
    expect(Buffer.from(htmlBody.replace(/\r\n/g, ''), 'base64').toString()).toBe(
      BASE_MESSAGE.html,
    );
  });

  it('writes the From, To, Subject, Date and MIME headers', () => {
    const mime = decodeRaw(buildGmailRawMessage(BASE_MESSAGE));

    expect(mime).toContain(
      'From: "RAF Consult PMS" <rafconsultpms@gmail.com>',
    );
    expect(mime).toContain('To: demo.member@gmail.com');
    expect(mime).toContain(
      'Subject: Your RAF CONSULT MARS account is ready',
    );
    expect(mime).toContain('Date: Wed, 18 Nov 2026 02:00:00 GMT');
    expect(mime).toContain('MIME-Version: 1.0');
  });

  it('joins multiple recipients and includes Reply-To when configured', () => {
    const mime = decodeRaw(
      buildGmailRawMessage({
        ...BASE_MESSAGE,
        to: ['demo.member@gmail.com', 'admin@gmail.com'],
        replyTo: 'rafconsultpms@gmail.com',
      }),
    );

    expect(mime).toContain('To: demo.member@gmail.com, admin@gmail.com');
    expect(mime).toContain('Reply-To: rafconsultpms@gmail.com');
  });

  it('omits Reply-To when none is configured', () => {
    expect(decodeRaw(buildGmailRawMessage(BASE_MESSAGE))).not.toContain(
      'Reply-To:',
    );
  });

  it('escapes a quoted display name', () => {
    const mime = decodeRaw(
      buildGmailRawMessage({ ...BASE_MESSAGE, fromName: 'RAF "PMS"' }),
    );

    expect(mime).toContain('From: "RAF \\"PMS\\"" <rafconsultpms@gmail.com>');
  });

  it('encodes a non-ASCII subject as an RFC 2047 encoded word', () => {
    const mime = decodeRaw(
      buildGmailRawMessage({ ...BASE_MESSAGE, subject: 'Résumé prêt' }),
    );
    const encoded = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(mime);

    expect(encoded).not.toBeNull();
    expect(Buffer.from(encoded![1], 'base64').toString('utf8')).toBe(
      'Résumé prêt',
    );
  });

  it('keeps a printable ASCII subject unencoded', () => {
    const mime = decodeRaw(buildGmailRawMessage(BASE_MESSAGE));

    expect(mime).not.toContain('=?UTF-8?B?');
  });

  it('strips CR/LF so a header cannot be injected', () => {
    const mime = decodeRaw(
      buildGmailRawMessage({
        ...BASE_MESSAGE,
        subject: 'Hello\r\nBcc: evil@example.com',
        fromName: 'RAF\r\nBcc: evil@example.com',
      }),
    );

    expect(mime).not.toContain('\r\nBcc:');
    expect(mime).toContain('Subject: Hello Bcc: evil@example.com');
  });

  it('rejects an injected or malformed recipient instead of sending it', () => {
    expect(() =>
      buildGmailRawMessage({
        ...BASE_MESSAGE,
        to: 'demo.member@gmail.com\r\nBcc: evil@example.com',
      }),
    ).toThrow('Recipient is not an email address');

    expect(() =>
      buildGmailRawMessage({ ...BASE_MESSAGE, to: 'not-an-address' }),
    ).toThrow('Recipient is not an email address');
  });

  it('rejects a sender that is not an email address', () => {
    expect(() =>
      buildGmailRawMessage({ ...BASE_MESSAGE, sender: 'not-an-address' }),
    ).toThrow('GMAIL_SENDER must be an email address');
  });
});
