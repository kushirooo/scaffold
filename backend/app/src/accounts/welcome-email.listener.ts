import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ACCOUNT_CREATED,
  type AccountCreatedPayload,
} from './account-events.js';
import { WelcomeEmailService } from './welcome-email.service.js';

/**
 * Thin event adapter for the US02 seam. The service owns all email behaviour;
 * this listener only awaits it. The final catch is defensive: an unhandled
 * listener rejection must never crash the process or fail US02's request.
 */
@Injectable()
export class WelcomeEmailListener {
  private readonly logger = new Logger(WelcomeEmailListener.name);

  constructor(private readonly welcome: WelcomeEmailService) {}

  @OnEvent(ACCOUNT_CREATED, { async: true })
  async onAccountCreated(payload: AccountCreatedPayload): Promise<void> {
    try {
      await this.welcome.handleAccountCreated(payload);
    } catch (error) {
      this.logger.error({
        event: 'welcome_email_listener_failed',
        userId: payload.userId,
        correlationId: payload.correlationId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }
}
