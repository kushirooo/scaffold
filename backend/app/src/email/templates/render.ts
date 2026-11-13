import type { EmailMessage } from '../email-sender.js';
import type { UserRole } from '../../users/user.types.js';

/** The fields a template owns; the caller supplies `to` and the transport. */
export type RenderedEmail = Pick<EmailMessage, 'subject' | 'text' | 'html'>;

/** MARS brand navy used for the header and primary action (inline styles only). */
export const MARS_NAVY = '#0b1f3a';

/** System-safe font stack: no webfonts, so the message renders anywhere. */
export const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element and attribute contexts. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Strips CR/LF so an interpolated value cannot break out of or inject an email
 * header. Used only for the admin-alert subject, the one header built from data.
 */
export function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Human label for a role enum value: PROJECT_MANAGER -> "Project manager". */
export function roleLabel(role: UserRole): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}

/** "24 hours" / "1 hour"; used to state expiry in human terms. */
export function humanDuration(value: number, unit: 'hour' | 'minute'): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function renderHtmlParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2933;">${html}</p>`;
}

/** Escapes the text before wrapping it, for paragraphs built only from data. */
export function renderParagraph(text: string): string {
  return renderHtmlParagraph(escapeHtml(text));
}

/** Escapes the label; `value` is treated as text and escaped too. */
export function renderDetail(label: string, value: string): string {
  return renderHtmlParagraph(
    `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`,
  );
}

export function renderHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:#1f2933;">${escapeHtml(text)}</h1>`;
}

/** One primary inline-styled action; both the href and the label are escaped. */
export function renderButton(href: string, label: string): string {
  return `<p style="margin:0 0 20px;"><a href="${escapeHtml(href)}" style="display:inline-block;background-color:${MARS_NAVY};color:#ffffff;font-size:15px;line-height:20px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:4px;">${escapeHtml(label)}</a></p>`;
}

export function renderTextFooter(fromAddress?: string): string {
  const lines = ['RAF CONSULT · Project Management System'];
  if (fromAddress) {
    lines.push(`Sent by ${fromAddress}`);
  }
  return lines.join('\n');
}

export interface EmailLayoutInput {
  /** Document title, escaped by the layout. */
  title: string;
  /** Trusted HTML assembled by the template; every value is already escaped. */
  bodyHtml: string;
  /** Shown in the footer so dev, staging and demo screenshots are comparable. */
  fromAddress?: string;
}

/**
 * Shared table-based shell: navy header, white card, system fonts, inline
 * styles only. No images, stylesheets, webfonts or tracking pixels.
 */
export function renderLayout(input: EmailLayoutInput): string {
  const sentBy = input.fromAddress
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:18px;color:#7b8794;">Sent by ${escapeHtml(input.fromAddress)}</p>`
    : '';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(input.title)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:${FONT_STACK};color:#1f2933;">`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;">',
    `<tr><td style="background-color:${MARS_NAVY};padding:20px 28px;border-radius:8px 8px 0 0;">`,
    '<p style="margin:0;font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#9fb3c8;">RAF CONSULT</p>',
    '<p style="margin:4px 0 0;font-size:20px;line-height:26px;font-weight:600;color:#ffffff;">MARS</p>',
    '</td></tr>',
    `<tr><td style="padding:28px;">${input.bodyHtml}</td></tr>`,
    '<tr><td style="padding:16px 28px 24px;border-top:1px solid #e4e7eb;">',
    '<p style="margin:0;font-size:12px;line-height:18px;color:#7b8794;">RAF CONSULT · Project Management System</p>',
    sentBy,
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}
