import { Logger } from '@nestjs/common';
import type { AccountCreatedPayload } from './account-events.js';
import { WelcomeEmailListener } from './welcome-email.listener.js';
import type {
  WelcomeEmailResult,
  WelcomeEmailService,
} from './welcome-email.service.js';

const PAYLOAD: AccountCreatedPayload = {
  userId: '8a1f0c8e-6f6a-4d3f-9a5e-2f7c1b4d9e01',
  email: 'new.member@rafconsult.test',
  fullName: 'Aisyah Rahman',
  role: 'WORKER',
  occurredAt: new Date('2026-11-13T09:00:00.000Z'),
  correlationId: 'corr-5678-fake',
};

function serviceReturning(
  handler: (payload: AccountCreatedPayload) => Promise<WelcomeEmailResult>,
): WelcomeEmailService {
  return { handleAccountCreated: handler } as unknown as WelcomeEmailService;
}

describe('WelcomeEmailListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('awaits the one service handler with the payload', async () => {
    const received: AccountCreatedPayload[] = [];
    const listener = new WelcomeEmailListener(
      serviceReturning(async (payload) => {
        received.push(payload);
        return { status: 'sent' };
      }),
    );

    await listener.onAccountCreated(PAYLOAD);

    expect(received).toEqual([PAYLOAD]);
  });

  it('logs and swallows an unexpected service rejection', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const listener = new WelcomeEmailListener(
      serviceReturning(async () => {
        throw new Error('unexpected');
      }),
    );

    await expect(listener.onAccountCreated(PAYLOAD)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: 'welcome_email_listener_failed',
      userId: PAYLOAD.userId,
      correlationId: PAYLOAD.correlationId,
      errorName: 'Error',
    });
  });
});
