import { MARS_NAVY, type RenderedEmail } from './render.js';
import {
  ADMIN_ALERT_SUBJECT_PREFIX,
  type AdminAlertEmailInput,
  renderAdminAlertEmail,
} from './admin-alert.template.js';

const OCCURRED_AT = new Date('2026-11-12T09:30:00.000Z');

const INPUT: AdminAlertEmailInput = {
  userId: '8a1f0c8e-6f6a-4d3f-9a5e-2f7c1b4d9e01',
  email: 'member@rafconsult.test',
  role: 'PROJECT_MANAGER',
  errorName: 'EmailSendError',
  errorMessage: 'Resend rejected the message with status 422',
  occurredAt: OCCURRED_AT,
  correlationId: 'corr-1234-fake',
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

describe('renderAdminAlertEmail', () => {
  it('names the failed recipient in the exact subject shape', () => {
    expect(renderAdminAlertEmail(INPUT).subject).toBe(
      '[MARS] Welcome email failed for member@rafconsult.test',
    );
    expect(ADMIN_ALERT_SUBJECT_PREFIX).toBe(
      '[MARS] Welcome email failed for ',
    );
  });

  it('reports the identifiers, failure and timestamp in both alternatives', () => {
    const rendered = renderAdminAlertEmail(INPUT);

    for (const alternative of [rendered.html, rendered.text]) {
      expect(alternative).toContain(INPUT.userId);
      expect(alternative).toContain(INPUT.email);
      expect(alternative).toContain(INPUT.role);
      expect(alternative).toContain(INPUT.errorName);
      expect(alternative).toContain(INPUT.errorMessage);
      expect(alternative).toContain('2026-11-12T09:30:00.000Z');
      expect(alternative).toContain(INPUT.correlationId);
    }
  });

  it('states that the account still exists', () => {
    const rendered = renderAdminAlertEmail(INPUT);

    expect(rendered.html).toContain('The account exists');
    expect(rendered.text).toContain('The account exists');
  });

  it('never leaks a token even when one is passed alongside the input', () => {
    const withToken = { ...INPUT, token: 'fake-invite-token-abc123' };

    const rendered = renderAdminAlertEmail(withToken);

    for (const alternative of [rendered.html, rendered.text, rendered.subject]) {
      expect(alternative).not.toContain('fake-invite-token-abc123');
    }
  });

  it('strips CR/LF from the email used in the subject header', () => {
    const rendered = renderAdminAlertEmail({
      ...INPUT,
      email: 'user@rafconsult.test\r\nBcc: evil@rafconsult.test',
    });

    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.subject).toBe(
      '[MARS] Welcome email failed for user@rafconsult.test Bcc: evil@rafconsult.test',
    );
  });

  it('escapes the email and error message in the HTML alternative', () => {
    const rendered = renderAdminAlertEmail({
      ...INPUT,
      email: '<script>@rafconsult.test',
      errorMessage: '<script>alert("x")</script>',
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;@rafconsult.test');
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;x&quot;)');
  });

  it('renders the shared shell with no external assets or tracking', () => {
    assertSafeHtml(renderAdminAlertEmail(INPUT));
  });
});
