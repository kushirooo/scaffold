import { MARS_NAVY, type RenderedEmail } from './render.js';
import {
  RESET_EMAIL_SUBJECT,
  type ResetEmailInput,
  renderResetEmail,
} from './reset.template.js';

const INPUT: ResetEmailInput = {
  fullName: 'Aisyah Rahman',
  resetUrl:
    'https://portal.rafconsult.test/reset-password?token=fake-reset-token-def456',
  expiresInMinutes: 15,
  fromAddress: 'RAF CONSULT MARS <no-reply@rafconsult.test>',
};

function assertSafeHtml(rendered: RenderedEmail): void {
  const { html } = rendered;
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<img/i);
  expect(html).not.toMatch(/<style/i);
  expect(html).not.toMatch(/<link/i);
  expect(html).not.toContain('background-image');
  expect(html).not.toContain('url(');
  expect(html).toContain('style="');
  expect(html).toContain(MARS_NAVY);
}

describe('renderResetEmail', () => {
  it('carries the 15-minute reset link in both alternatives', () => {
    const rendered = renderResetEmail(INPUT);

    expect(rendered.subject).toBe(RESET_EMAIL_SUBJECT);
    for (const alternative of [rendered.html, rendered.text]) {
      expect(alternative).toContain(INPUT.resetUrl);
      expect(alternative).toContain('expires in 15 minutes');
      expect(alternative).toContain(
        'RAF CONSULT · Project Management System',
      );
    }
    expect(rendered.html).toContain('Reset password');
    expect(rendered.text).toContain('Choose a new password');
  });

  it('greets an optional name and falls back to a plain greeting', () => {
    const named = renderResetEmail(INPUT);
    expect(named.html).toContain('Hello, Aisyah Rahman');
    expect(named.text).toContain('Hello, Aisyah Rahman');

    const anonymous = renderResetEmail({ ...INPUT, fullName: undefined });
    expect(anonymous.html).toContain('>Hello</h1>');
    expect(anonymous.text.startsWith('Hello\n')).toBe(true);
  });

  it('escapes a script-bearing name in the HTML alternative', () => {
    const rendered = renderResetEmail({
      ...INPUT,
      fullName: `<script>alert("x")</script>`,
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('never contains a password or a password hash', () => {
    const rendered = renderResetEmail(INPUT);

    for (const alternative of [rendered.html, rendered.text]) {
      expect(alternative).not.toMatch(/password\s*[:=]/i);
      expect(alternative).not.toMatch(/\$argon2/);
    }
  });

  it('renders the shared shell with no external assets or tracking', () => {
    const rendered = renderResetEmail(INPUT);
    assertSafeHtml(rendered);

    const urls = [...rendered.html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map(
      (match) => match[0],
    );
    expect(new Set(urls)).toEqual(new Set([INPUT.resetUrl]));
  });
});
