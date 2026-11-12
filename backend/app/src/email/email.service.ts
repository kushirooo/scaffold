import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from './email-sender.js';

/**
 * Application-facing email seam. Feature modules depend on this service rather
 * than on a transport; `EMAIL_SENDER` selects the adapter at boot and tests
 * override that token with a fake or the in-memory adapter.
 */
@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_SENDER) private readonly sender: EmailSender) {}

  /**
   * Sends one rendered message. Transport failures surface unchanged as the
   * adapter's typed `EmailSendError`; callers own the failure semantics.
   */
  async send(message: EmailMessage): Promise<void> {
    await this.sender.send(message);
  }
}
