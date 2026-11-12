import type { EmailMessage, EmailSender } from '../email-sender.js';

function copy(message: EmailMessage): EmailMessage {
  return {
    ...message,
    to: Array.isArray(message.to) ? [...message.to] : message.to,
  };
}

/**
 * In-process transport for tests and the non-production fallback: it records
 * every message and never opens a socket. Nothing is written to a log.
 */
export class MemoryEmailSender implements EmailSender {
  private readonly recorded: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.recorded.push(copy(message));
  }

  /** Recorded messages in send order; copies, so assertions cannot mutate the outbox. */
  get messages(): readonly EmailMessage[] {
    return this.recorded.map(copy);
  }

  clear(): void {
    this.recorded.length = 0;
  }
}
