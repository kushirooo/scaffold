/**
 * Shared HTTP client for the MARS frontend.
 *
 * Every call to the NestJS API goes through `apiRequest` so the base URL,
 * credentials, CSRF header, and error shape stay consistent across services
 * and components (k330/STAB-0).
 */

/** API origin, without a trailing slash, so `path` can always start with `/`. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

const NETWORK_ERROR_MESSAGE =
  'Unable to connect to the server. Please check that the backend is running and try again.';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Error thrown for every failed API call, including transport failures (status 0). */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the API. */
  readonly status: number;
  /** API error code (or a client-side code such as NETWORK_ERROR), when present. */
  readonly code?: string;
  /** Individual validation messages when the API returned `message: string[]`. */
  readonly details: string[];

  constructor(message: string, status: number, code?: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** True when the failure is an unauthenticated session (HTTP 401). */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

interface ErrorMessage {
  message?: string;
  details: string[];
}

/** Normalise a `message`/`error` field: string stays whole, string[] becomes details. */
function readErrorMessage(value: unknown): ErrorMessage {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return { message: trimmed || undefined, details: [] };
  }
  if (Array.isArray(value)) {
    const details = value.filter((item): item is string => typeof item === 'string');
    return { message: details.length > 0 ? details.join(' ') : undefined, details };
  }
  return { details: [] };
}

function extractErrorMessage(payload: unknown): ErrorMessage {
  if (typeof payload === 'string' || Array.isArray(payload)) {
    return readErrorMessage(payload);
  }
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const fromMessage = readErrorMessage(record.message);
    if (fromMessage.message !== undefined) return fromMessage;
    return readErrorMessage(record.error);
  }
  return { details: [] };
}

/** Plain-text error bodies are surfaced only when short and non-HTML. */
function readablePlainText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 300 || trimmed.includes('<')) return undefined;
  return trimmed;
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    text = '';
  }

  let payload: unknown = null;
  let isJson = false;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
      isJson = true;
    } catch {
      payload = null;
    }
  }

  const extracted = extractErrorMessage(payload);
  const message =
    extracted.message ??
    (isJson ? undefined : readablePlainText(text)) ??
    `Request failed (${response.status}).`;

  const record =
    payload !== null && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  const code = typeof record?.code === 'string' ? record.code : undefined;

  return new ApiError(message, response.status, code, extracted.details);
}

/**
 * Call the MARS API and return the parsed JSON body.
 *
 * - `/`-relative `path`, base URL is `API_BASE_URL`
 * - cookies are always sent (`credentials: 'include'`)
 * - non-GET/HEAD/OPTIONS requests carry the `X-MARS-CSRF` header
 * - JSON bodies are stringified by the caller; FormData is left untouched
 * - 204 and empty-body successes resolve to `undefined`
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    headers.set('X-MARS-CSRF', '1');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  const text = await response.text().catch(() => '');
  if (!text.trim()) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      `The API returned an invalid response (${response.status}).`,
      response.status,
      'INVALID_RESPONSE',
    );
  }
}
