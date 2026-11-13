import type { UserRole } from '../../users/user.types.js';
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
  roleLabel,
} from './render.js';

/** Exact subject required by SPRINT1_PLAN.md §8.5. */
export const WELCOME_EMAIL_SUBJECT = 'Your RAF CONSULT MARS account is ready';

export interface WelcomeEmailInput {
  fullName: string;
  role: UserRole;
  loginUrl: string;
  activationUrl: string;
  expiresInHours: number;
  fromAddress?: string;
}

const LINK_STYLE = 'color:#0b1f3a;text-decoration:underline;';

/**
 * US18 welcome email: a single-use activation link, never credentials. The
 * caller builds both URLs (it owns FRONTEND_URL and the token); this function
 * is pure and escapes every interpolated value.
 */
export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const role = roleLabel(input.role);
  const expiry = `expires in ${humanDuration(input.expiresInHours, 'hour')}`;
  const loginUrl = escapeHtml(input.loginUrl);

  const bodyHtml = [
    renderHeading(`Welcome, ${input.fullName}`),
    renderParagraph(
      `Your RAF CONSULT MARS account has been created with the role of ${role}.`,
    ),
    renderParagraph(
      `Set your password using the single-use link below. It ${expiry}.`,
    ),
    renderButton(input.activationUrl, 'Set your password'),
    renderHtmlParagraph(
      `You can sign in at <a href="${loginUrl}" style="${LINK_STYLE}">${loginUrl}</a>.`,
    ),
    renderParagraph(
      'If you did not expect this email, contact your administrator.',
    ),
  ].join('\n');

  const text = [
    `Welcome, ${input.fullName}`,
    '',
    `Your RAF CONSULT MARS account has been created with the role of ${role}.`,
    '',
    `Set your password using the single-use link below. It ${expiry}:`,
    input.activationUrl,
    '',
    'Sign in at:',
    input.loginUrl,
    '',
    'If you did not expect this email, contact your administrator.',
    '',
    renderTextFooter(input.fromAddress),
    '',
  ].join('\n');

  return {
    subject: WELCOME_EMAIL_SUBJECT,
    text,
    html: renderLayout({
      title: WELCOME_EMAIL_SUBJECT,
      fromAddress: input.fromAddress,
      bodyHtml,
    }),
  };
}
