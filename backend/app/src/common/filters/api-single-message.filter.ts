import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildErrorBody } from '../error-body.js';

/**
 * Sprint 2 error filter: one `message` string plus `code`, per the Sprint 2
 * API contract §1.4. Apply it to a controller with `@UseFilters`. The global
 * envelope filter still covers guard errors outside the controller context.
 */
@Catch()
export class ApiSingleMessageFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiSingleMessageFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = buildErrorBody(exception, { flatten: true });

    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception),
      );
    }

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(body.statusCode)
      .json(body);
  }
}
