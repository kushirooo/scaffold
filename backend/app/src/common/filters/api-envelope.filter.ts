import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildErrorBody } from '../error-body.js';

/**
 * Global envelope filter. It adds `statusCode`, `error` and `code` to every
 * error, but keeps the current `message` shape. Legacy routes (US01–US03)
 * keep their message arrays, so the US03 forms keep their `details` and the
 * existing contracts stay valid.
 */
@Catch()
export class ApiEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiEnvelopeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = buildErrorBody(exception, { flatten: false });

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
