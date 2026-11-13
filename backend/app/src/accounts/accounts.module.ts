import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { WelcomeEmailListener } from './welcome-email.listener.js';
import { WelcomeEmailService } from './welcome-email.service.js';

/**
 * US18 accounts seam. Imports AuthModule for the exported ResetTokenService and
 * EmailModule for the transport-independent EmailService. AppModule wires this
 * module so the `account.created` listener is registered once.
 */
@Module({
  imports: [AuthModule, EmailModule],
  providers: [WelcomeEmailService, WelcomeEmailListener],
  exports: [WelcomeEmailService],
})
export class AccountsModule {}
