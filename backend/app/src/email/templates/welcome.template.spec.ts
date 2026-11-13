import {
  FONT_STACK,
  MARS_NAVY,
  type RenderedEmail,
} from './render.js';
import {
  WELCOME_EMAIL_SUBJECT,
  type WelcomeEmailInput,
  renderWelcomeEmail,
} from './welcome.template.js';

const INPUT: WelcomeEmailInput = {
  fullName: 'Aisyah Rahman',
  role: 'PROJECT_MANAGER',
  loginUrl: 'https://portal.rafconsult.test/login',
  activationUrl:
    'https://portal.rafconsult.test/reset-password?token=fake-invite-token-abc123',
  expiresInHours: 24,
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
  expect(html).toContain(FONT_STACK);
}

describe('renderWelcomeEmail', () => {
  it('uses the exact subject required by the plan', () => {
    expect(renderWelcomeEmail(INPUT).subject).toBe(
      'Your RAF CONSULT MARS account is ready',
    );
    expect(WELCOME_EMAIL_SUBJECT).toBe(
      'Your RAF CONSULT MARS account is ready',
    );
  });

  it('greets by name and states the role and expiry in human terms', () => {
    const rendered = renderWelcomeEmail(INPUT);

    expect(rendered.html).toContain('Welcome, Aisyah Rahman');
    expect(rendered.text).toContain('Welcome, Aisyah Rahman');
    expect(rendered.html).toContain('Project manager');
    expect(rendered.text).toContain('Project manager');
    expect(rendered.html).toContain('expires in 24 hours');
    expect(rendered.text).toContain('expires in 24 hours');
  });

  it('carries the activation link and the login URL in both alternatives', () => {
    const rendered = renderWelcomeEmail(INPUT);

    for (const alternative of [rendered.html, rendered.text]) {
      expect(alternative).toContain(INPUT.activationUrl);
      expect(alternative).toContain(INPUT.loginUrl);
      expect(alternative).toContain('Set your password');
      expect(alternative).toContain(
        'If you did not expect this email, contact your administrator.',
      );
      expect(alternative).toContain(
        'RAF CONSULT · Project Management System',
      );
      expect(alternative).toContain('Sent by RAF CONSULT MARS');
    }
  });

  it('never contains a password or a password hash', () => {
    const rendered = renderWelcomeEmail(INPUT);

    for (const alternative of [rendered.html, rendered.text]) {
      expect(alternative).not.toMatch(/password\s*[:=]/i);
      expect(alternative).not.toMatch(/\$argon2/);
      expect(alternative).not.toContain('hunter2');
    }
  });

  it('escapes a script-bearing full name in the HTML alternative', () => {
    const rendered = renderWelcomeEmail({
      ...INPUT,
      fullName: `<script>alert("x")</script>`,
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('Welcome, &lt;script&gt;');
  });

  it('escapes the URLs inside href attributes', () => {
    const rendered = renderWelcomeEmail({
      ...INPUT,
      activationUrl:
        'https://portal.rafconsult.test/reset-password?token=a&next=b',
    });

    expect(rendered.html).toContain('token=a&amp;next=b');
  });

  it('renders the shared shell with no external assets or tracking', () => {
    const rendered = renderWelcomeEmail(INPUT);
    assertSafeHtml(rendered);

    const urls = [...rendered.html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map(
      (match) => match[0],
    );
    expect(new Set(urls)).toEqual(
      new Set([INPUT.loginUrl, INPUT.activationUrl]),
    );
  });

  it('omits the sending address when the caller does not provide one', () => {
    const rendered = renderWelcomeEmail({
      ...INPUT,
      fromAddress: undefined,
    });

    expect(rendered.html).not.toContain('Sent by');
    expect(rendered.text).not.toContain('Sent by');
    expect(rendered.html).toContain('RAF CONSULT · Project Management System');
  });
});
