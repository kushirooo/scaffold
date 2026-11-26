import { HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

export interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  code: string;
  /** Extra fields from a custom exception body (for example `stage`). */
  [key: string]: unknown;
}

/** Contract messages that carry a specific error code. */
const MESSAGE_CODES: ReadonlyMap<string, string> = new Map([
  ['Missing or invalid CSRF header', 'CSRF_MISSING'],
  ['Enter a valid due date.', 'INVALID_DUE_DATE'],
  ['Enter a valid target date.', 'INVALID_TARGET_DATE'],
  ['Select a valid priority.', 'INVALID_PRIORITY'],
  ['Select a valid status.', 'INVALID_STATUS'],
  [
    'The assignee must be an active worker in this project.',
    'ASSIGNEE_NOT_IN_PROJECT',
  ],
  [
    'The milestone must be in the same project as the task.',
    'MILESTONE_WRONG_PROJECT',
  ],
  ['Due date cannot be in the past.', 'DUE_DATE_IN_PAST'],
  ['A completed task cannot be edited.', 'TASK_COMPLETED'],
  [
    'Only the assigned person can change the status of this task.',
    'NOT_ASSIGNEE',
  ],
  [
    'Task status can only move from Pending to In Progress to Completed.',
    'INVALID_STATUS_TRANSITION',
  ],
  ['The identifier is not valid.', 'INVALID_ID'],
  ['The item was not found.', 'NOT_FOUND'],
  ['You do not have permission to do this.', 'FORBIDDEN_ROLE'],
]);

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Request failed.';
    case 401:
      return 'Authentication required';
    case 403:
      return 'You do not have permission to do this.';
    case 404:
      return 'The item was not found.';
    case 409:
      return 'Request conflicts with the current state.';
    default:
      return 'Something went wrong. Try again.';
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN_ROLE';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    default:
      return 'INTERNAL_ERROR';
  }
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter(
    (item): item is string => typeof item === 'string',
  );
  return strings.length > 0 ? strings : undefined;
}

interface NormaliseOptions {
  /** Keep only the first validation message. */
  flatten: boolean;
}

/**
 * Build one response body for every exception. `flatten` is false for the
 * global envelope filter (legacy routes keep their message arrays and the
 * frontend keeps their `details`) and true for the Sprint 2 routes (one
 * message, as the Sprint 2 contract requires).
 */
export function buildErrorBody(
  exception: unknown,
  options: NormaliseOptions,
): ErrorBody {
  let statusCode = 500;
  let messages: string[] | undefined;
  let wasArray = false;
  let explicitCode: string | undefined;
  const extras: Record<string, unknown> = {};

  if (exception instanceof HttpException) {
    statusCode = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      messages = [response];
    } else if (Array.isArray(response)) {
      wasArray = true;
      messages = readStringArray(response);
    } else if (response !== null && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const normalisedKeys = new Set([
        'statusCode',
        'error',
        'message',
        'code',
      ]);
      for (const [key, value] of Object.entries(record)) {
        if (!normalisedKeys.has(key)) {
          extras[key] = value;
        }
      }

      if (Array.isArray(record.message)) {
        wasArray = true;
        messages = readStringArray(record.message);
      } else if (typeof record.message === 'string') {
        messages = [record.message];
      } else if (typeof record.error === 'string') {
        messages = [record.error];
      }

      if (typeof record.code === 'string' && record.code.trim()) {
        explicitCode = record.code;
      }
    }
  }

  if (!messages || messages.length === 0) {
    messages = [defaultMessage(statusCode)];
    wasArray = false;
  }

  const first = messages[0] ?? defaultMessage(statusCode);
  const mappedCode = MESSAGE_CODES.get(first);
  const code =
    explicitCode ??
    mappedCode ??
    (wasArray ? 'VALIDATION_FAILED' : defaultCode(statusCode));

  const message: string | string[] = options.flatten
    ? first
    : wasArray
      ? messages
      : first;

  return {
    ...extras,
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    code,
  };
}
