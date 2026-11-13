import {
  type RenderedEmail,
  escapeHtml,
  humanDuration,
  renderButton,
  renderHeading,
  renderHtmlParagraph,
  renderLayout,
  renderParagraph,
  renderTextFooter,
} from './render.js';

export const RESET_EMAIL_SUBJECT = 'Reset your RAF CONSULT MARS password';

export interface ResetEmailInput {
  fullName?: string;
  resetUrl: string;
  expiresInMinutes: number;
  fromAddress?: string;
}

const LINK_STYLE = 'color:#0b1f3a;text-decoration:underline;';

/**
 * US19 reset email: a 15-minute single-use link. The caller builds the URL and
 * owns the token; this function is pure and escapes every interpolated value.
 */
export function renderResetEmail(input: ResetEmailInput): RenderedEmail {
  const name = input.fullName?.trim();
  const expiry = `expires in ${humanDuration(input.expiresInMinutes, 'minute')}`;
  const resetUrl = escapeHtml(input.resetUrl);

  const bodyHtml = [
    renderHeading(name ? `Hello, ${name}` : 'Hello'),
    renderParagraph(
      'A password reset was requested for your RAF CONSULT MARS account.',
    ),
    renderParagraph(
      `Choose a new password using the single-use link below. It ${expiry}.`,
    ),
    renderButton(input.resetUrl, 'Reset password'),
    renderHtmlParagraph(
      `If the button does not work, open this link: <a href="${resetUrl}" style="${LINK_STYLE}">${resetUrl}</a>`,
    ),
    renderParagraph(
      'If you did not request this, ignore this email and your password will not change. Contact your administrator if you are unsure.',
    ),
  ].join('\n');

  const text = [
    name ? `Hello, ${name}` : 'Hello',
    '',
    'A password reset was requested for your RAF CONSULT MARS account.',
    '',
    `Choose a new password using the single-use link below. It ${expiry}:`,
    input.resetUrl,
    '',
    'If you did not request this, ignore this email and your password will not change. Contact your administrator if you are unsure.',
    '',
    renderTextFooter(input.fromAddress),
    '',
  ].join('\n');

  return {
    subject: RESET_EMAIL_SUBJECT,
    text,
    html: renderLayout({
      title: RESET_EMAIL_SUBJECT,
      fromAddress: input.fromAddress,
      bodyHtml,
    }),
  };
}
