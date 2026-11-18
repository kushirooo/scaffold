import { randomUUID } from 'node:crypto';
import { parseMailbox, stripHeaderNewlines } from './mailbox.js';

/**
 * Builds the base64url-encoded RFC 5322 message the Gmail API expects in
 * `raw`. Gmail does not accept the app's plain `{text, html}` shape, so this
 * module is the one place that turns `EmailMessage` into wire bytes.
 *
 * Both alternatives are always included (US18/US19 require a plain-text copy),
 * every header is sanitised, and the message is normally under a few KB, so
 * Gmail's clipping limit is not a concern.
 */

const CRLF = '\r\n';
const BASE64_LINE_LENGTH = 76;
/** Keeps each `=?UTF-8?B?…?=` word within RFC 2047's 75-character limit. */
const ENCODED_WORD_CHUNK = 60;
const US_ASCII_ONLY = /^[\x20-\x7e]*$/;
/** Deliberately simple: Gmail validates the address, we only reject injections. */
const ADDRESS_PATTERN = /^[^\s<>@,;:"\\]+@[^\s<>@,;:"\\]+$/;

export interface GmailRawMessageInput {
  /** Authorised Gmail account; becomes the From address. */
  sender: string;
  /** Display name for the From header. */
  fromName?: string;
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Injectable for deterministic tests. */
  date?: Date;
}

/** Quotes and escapes a display name that is already free of line breaks. */
function quoteDisplayName(name: string): string {
  return `"${name.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

/** RFC 2047 encoded-words for a value that is not plain printable ASCII. */
function encodeUnstructuredHeader(value: string): string {
  if (US_ASCII_ONLY.test(value)) {
    return value;
  }

  const base64 = Buffer.from(value, 'utf8').toString('base64');
  const words: string[] = [];
  for (let index = 0; index < base64.length; index += ENCODED_WORD_CHUNK) {
    words.push(`=?UTF-8?B?${base64.slice(index, index + ENCODED_WORD_CHUNK)}?=`);
  }
  return words.join(`${CRLF} `);
}

/** The From header value: a quoted display name when one is configured. */
function fromHeader(sender: string, fromName?: string): string {
  const name = fromName ? stripHeaderNewlines(fromName) : '';
  if (!name) {
    return sender;
  }

  const encoded = US_ASCII_ONLY.test(name)
    ? quoteDisplayName(name)
    : encodeUnstructuredHeader(name);
  return `${encoded} <${sender}>`;
}

/** A base64 body part, wrapped so no MIME line exceeds 76 characters. */
function base64Body(value: string): string {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  const lines: string[] = [];
  for (let index = 0; index < base64.length; index += BASE64_LINE_LENGTH) {
    lines.push(base64.slice(index, index + BASE64_LINE_LENGTH));
  }
  return lines.join(CRLF);
}

function mimePart(
  boundary: string,
  contentType: string,
  content: string,
): string {
  return [
    `--${boundary}`,
    `Content-Type: ${contentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(content),
  ].join(CRLF);
}

/**
 * Normalises a recipient list: newlines are stripped, display names are
 * discarded (Gmail accepts `Name <addr>` but the app only ever stores bare
 * addresses) and every entry must contain an `@`.
 */
function recipientsOf(to: string | string[]): string[] {
  const values = Array.isArray(to) ? to : [to];
  const recipients = values
    .map((value) => parseMailbox(value).email)
    .filter((value) => value.length > 0);

  if (recipients.length === 0) {
    throw new Error('At least one recipient is required');
  }
  for (const recipient of recipients) {
    if (!ADDRESS_PATTERN.test(recipient)) {
      throw new Error('Recipient is not an email address');
    }
  }
  return recipients;
}

/**
 * Returns `raw` for `users.messages.send`: base64url of a complete MIME
 * message with a `multipart/alternative` text + HTML body.
 */
export function buildGmailRawMessage(input: GmailRawMessageInput): string {
  const sender = parseMailbox(input.sender).email;
  if (!ADDRESS_PATTERN.test(sender)) {
    throw new Error('GMAIL_SENDER must be an email address');
  }

  const recipients = recipientsOf(input.to);
  const replyTo = input.replyTo
    ? parseMailbox(input.replyTo).email
    : undefined;
  if (replyTo !== undefined && !ADDRESS_PATTERN.test(replyTo)) {
    throw new Error('Reply-To is not an email address');
  }

  const boundary = `----=_MARS_${randomUUID().replace(/-/g, '')}`;
  const headers = [
    `From: ${fromHeader(sender, input.fromName)}`,
    `To: ${recipients.join(', ')}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeUnstructuredHeader(stripHeaderNewlines(input.subject))}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join(CRLF);

  const body = [
    mimePart(boundary, 'text/plain', input.text),
    mimePart(boundary, 'text/html', input.html),
    `--${boundary}--`,
    '',
  ].join(CRLF);

  return Buffer.from(`${headers}${CRLF}${CRLF}${body}`, 'utf8').toString(
    'base64url',
  );
}
