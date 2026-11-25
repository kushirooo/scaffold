import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { buildErrorBody } from './error-body.js';

describe('buildErrorBody', () => {
  it('keeps the legacy validation array by default', () => {
    const body = buildErrorBody(
      new BadRequestException(['Title is required.', 'Title is too long.']),
      { flatten: false },
    );

    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(['Title is required.', 'Title is too long.']);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('flattens to the first message for Sprint 2 routes', () => {
    const body = buildErrorBody(
      new BadRequestException(['Title is required.', 'Title is too long.']),
      { flatten: true },
    );

    expect(body.message).toBe('Title is required.');
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('maps a contract message to its code', () => {
    const body = buildErrorBody(
      new BadRequestException(['Enter a valid due date.']),
      { flatten: true },
    );

    expect(body.message).toBe('Enter a valid due date.');
    expect(body.code).toBe('INVALID_DUE_DATE');
  });

  it('keeps an explicit code and message', () => {
    const body = buildErrorBody(
      new HttpException(
        {
          code: 'DUE_DATE_IN_PAST',
          message: 'Due date cannot be in the past.',
        },
        400,
      ),
      { flatten: true },
    );

    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'DUE_DATE_IN_PAST',
      message: 'Due date cannot be in the past.',
    });
  });

  it('maps the CSRF guard message to CSRF_MISSING', () => {
    const body = buildErrorBody(
      new ForbiddenException('Missing or invalid CSRF header'),
      { flatten: false },
    );

    expect(body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      code: 'CSRF_MISSING',
      message: 'Missing or invalid CSRF header',
    });
  });

  it('keeps a legacy not-found message and code', () => {
    const body = buildErrorBody(
      new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      }),
      { flatten: false },
    );

    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      code: 'USER_NOT_FOUND',
      message: 'User not found.',
    });
  });

  it('returns a generic 500 body for an unknown error', () => {
    const body = buildErrorBody(new Error('boom'), { flatten: false });

    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Try again.',
    });
  });
});
