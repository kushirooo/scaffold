import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResetTokenService } from '../auth/reset-token.service.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.js';
import { EmailService } from '../email/email.service.js';
import type { CreateResetTokenInput } from '../reset-tokens/reset-token.types.js';
import type { ResetTokensRepository } from '../reset-tokens/reset-tokens.repository.js';
import type { AccountCreatedPayload } from './account-events.js';
import { WelcomeEmailService } from './welcome-email.service.js';

const FRONTEND_URL = 'https://portal.rafconsult.test';
const ADMIN_ALERTS = ['admin@rafconsult.test', 'ops@rafconsult.test'];
const MAIL_FROM = 'RAF CONSULT MARS <no-reply@rafconsult.test>';
const INVITE_TTL_SECONDS = 86_400;
const ACTIVATION_PREFIX = `${FRONTEND_URL}/reset-password?token=`;

const PAYLOAD: AccountCreatedPayload = {
  userId: '8a1f0c8e-6f6a-4d3f-9a5e-2f7c1b4d9e01',
  email: 'new.member@rafconsult.test',
  fullName: 'Aisyah Rahman',
  role: 'PROJECT_MANAGER',
  occurredAt: new Date('2026-11-13T09:00:00.000Z'),
  correlationId: 'corr-1234-fake',
};

class RecordingResetTokensRepository implements ResetTokensRepository {
  readonly calls: CreateResetTokenInput[] = [];
  failNext = false;

  async replaceUnused(input: CreateResetTokenInput): Promise<void> {
    this.calls.push({ ...input });
    if (this.failNext) {
      this.failNext = false;
      throw new Error('token store unavailable');
    }
  }
}

/** Records every send and fails the next one when asked, in call order. */
class ScriptedEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  private readonly failures: Error[] = [];

  failNext(error = new Error('smtp unavailable')): void {
    this.failures.push(error);
  }

  async send(message: EmailMessage): Promise<void> {
    this.messages.push({ ...message });
    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }
  }
}

function createService(): {
  service: WelcomeEmailService;
  repository: RecordingResetTokensRepository;
  sender: ScriptedEmailSender;
} {
  const repository = new RecordingResetTokensRepository();
  const tokens = new ResetTokenService(
    repository,
    new ConfigService({ INVITE_TTL_SECONDS }),
  );
  const sender = new ScriptedEmailSender();
  const service = new WelcomeEmailService(
    tokens,
    new EmailService(sender),
    new ConfigService({
      FRONTEND_URL,
      ADMIN_ALERT_EMAILS: ADMIN_ALERTS,
      MAIL_FROM,
      INVITE_TTL_SECONDS,
    }),
  );
  return { service, repository, sender };
}

function loggedEvents(spy: {
  mock: { calls: unknown[][] };
}): unknown[] {
  return spy.mock.calls.map((call) => call[0]);
}

describe('WelcomeEmailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends one welcome email when called directly (US02 fallback)', async () => {
    const { service, sender } = createService();

    const result = await service.handleAccountCreated(PAYLOAD);

    expect(result).toEqual({ status: 'sent' });
    expect(sender.messages).toHaveLength(1);
    const [welcome] = sender.messages;
    expect(welcome.to).toBe(PAYLOAD.email);
    expect(welcome.subject).toBe('Your RAF CONSULT MARS account is ready');
    expect(welcome.text).toContain(ACTIVATION_PREFIX);
    expect(welcome.text).toContain(`${FRONTEND_URL}/login`);
    expect(welcome.text).toContain('expires in 24 hours');
    expect(welcome.text).toContain('Aisyah Rahman');
    expect(welcome.text).not.toMatch(/\$argon2/);
  });

  it('stores only the SHA-256 hash of the token embedded in the link', async () => {
    const { service, repository, sender } = createService();

    await service.handleAccountCreated(PAYLOAD);

    const match = /token=([A-Za-z0-9_-]+)/.exec(sender.messages[0].text);
    expect(match).not.toBeNull();
    const rawToken = match?.[1] ?? '';
    const expectedHash = createHash('sha256')
      .update(rawToken, 'utf8')
      .digest('hex');

    expect(rawToken).toHaveLength(43);
    expect(repository.calls[0]).toMatchObject({
      userId: PAYLOAD.userId,
      purpose: 'INVITE',
      tokenHash: expectedHash,
    });
    expect(JSON.stringify(repository.calls)).not.toContain(rawToken);
  });

  it('on send failure: logs once, alerts once and returns failed', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, sender } = createService();
    sender.failNext(new Error('smtp timeout'));

    const result = await service.handleAccountCreated(PAYLOAD);

    expect(result).toEqual({ status: 'failed', stage: 'send' });
    expect(sender.messages).toHaveLength(2);
    const [welcome, alert] = sender.messages;
    expect(welcome.to).toBe(PAYLOAD.email);
    expect(alert.to).toEqual(ADMIN_ALERTS);
    expect(alert.subject).toBe(
      `[MARS] Welcome email failed for ${PAYLOAD.email}`,
    );
    expect(alert.text).toContain('The account exists');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(loggedEvents(errorSpy)[0]).toMatchObject({
      event: 'welcome_email_failed',
      stage: 'send',
      userId: PAYLOAD.userId,
      email: PAYLOAD.email,
      errorName: 'Error',
      correlationId: PAYLOAD.correlationId,
    });
    // No token, link or message body may reach the log line.
    expect(JSON.stringify(loggedEvents(errorSpy))).not.toContain(ACTIVATION_PREFIX);
    expect(JSON.stringify(loggedEvents(errorSpy))).not.toMatch(/\$argon2/);
  });

  it('on token failure: alerts once, sends no welcome email, stage token', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, repository, sender } = createService();
    repository.failNext = true;

    const result = await service.handleAccountCreated(PAYLOAD);

    expect(result).toEqual({ status: 'failed', stage: 'token' });
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0].to).toEqual(ADMIN_ALERTS);
    expect(loggedEvents(errorSpy)[0]).toMatchObject({
      event: 'welcome_email_failed',
      stage: 'token',
      userId: PAYLOAD.userId,
    });
  });

  it('on alert failure: logs it once and stops without recursing', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, sender } = createService();
    sender.failNext(new Error('smtp timeout'));
    sender.failNext(new Error('alert transport failed'));

    const result = await service.handleAccountCreated(PAYLOAD);

    expect(result).toEqual({ status: 'failed', stage: 'send' });
    // One failed welcome attempt + one failed alert attempt. No retry, no loop.
    expect(sender.messages).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(loggedEvents(errorSpy)[1]).toMatchObject({
      event: 'welcome_email_admin_alert_failed',
      userId: PAYLOAD.userId,
      correlationId: PAYLOAD.correlationId,
      errorName: 'Error',
    });
  });
});
