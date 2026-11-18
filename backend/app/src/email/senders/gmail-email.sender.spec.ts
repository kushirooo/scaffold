import { Logger } from '@nestjs/common';
import { EmailSendError } from '../email-sender.js';
import {
  GMAIL_SEND_ENDPOINT,
  GMAIL_TIMEOUT_MS,
  GMAIL_TOKEN_ENDPOINT,
  GmailEmailSender,
  type GmailEmailSenderOptions,
  type GmailHttpClient,
  type GmailRequest,
  type GmailResponse,
} from './gmail-email.sender.js';

const OPTIONS: GmailEmailSenderOptions = {
  clientId: 'client-id.apps.googleusercontent.com',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
  sender: 'rafconsultpms@gmail.com',
  fromName: 'RAF Consult PMS',
  replyTo: 'rafconsultpms@gmail.com',
};

const MESSAGE = {
  to: 'demo.member@gmail.com',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Welcome.\n\nSet your password: https://portal.example/reset?token=x',
  html: '<p>Welcome.</p>',
};

function response(
  status: number,
  body: unknown = {},
  statusText = '',
): GmailResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

function tokenBody(accessToken = 'access-token-1', expiresIn = 3600): unknown {
  return {
    access_token: accessToken,
    expires_in: expiresIn,
    scope: 'https://www.googleapis.com/auth/gmail.send',
    token_type: 'Bearer',
  };
}

interface RecordedRequest {
  url: string;
  request: GmailRequest;
}

function recordingClient(
  responder: (url: string, request: GmailRequest) => Promise<GmailResponse>,
): { client: GmailHttpClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    client: async (url, request) => {
      requests.push({ url, request });
      return responder(url, request);
    },
  };
}

/** Routes token calls and send calls to separate responders. */
function gmailClient(options: {
  token?: () => GmailResponse;
  send?: () => GmailResponse;
}): { client: GmailHttpClient; requests: RecordedRequest[] } {
  return recordingClient(async (url) => {
    if (url === GMAIL_TOKEN_ENDPOINT) {
      return (options.token ?? (() => response(200, tokenBody())))();
    }
    return (options.send ?? (() => response(200, { id: 'message-1' })))();
  });
}

function senderWith(
  client: GmailHttpClient,
  now: () => number = () => 1_000_000,
): GmailEmailSender {
  return new GmailEmailSender(OPTIONS, client, now);
}

async function catchRejection(promise: Promise<void>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GmailEmailSender', () => {
  it('refreshes one access token, then sends both alternatives via HTTPS', async () => {
    const { client, requests } = gmailClient({});
    const sender = senderWith(client);

    await sender.send(MESSAGE);
    await sender.send(MESSAGE);

    // Two sends share the cached token: token, send, send.
    expect(requests.map(({ url }) => url)).toEqual([
      GMAIL_TOKEN_ENDPOINT,
      GMAIL_SEND_ENDPOINT,
      GMAIL_SEND_ENDPOINT,
    ]);

    const tokenRequest = requests[0].request;
    expect(tokenRequest.method).toBe('POST');
    expect(tokenRequest.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(tokenRequest.body);
    expect(form.get('client_id')).toBe(OPTIONS.clientId);
    expect(form.get('client_secret')).toBe(OPTIONS.clientSecret);
    expect(form.get('refresh_token')).toBe(OPTIONS.refreshToken);
    expect(form.get('grant_type')).toBe('refresh_token');

    const sendRequest = requests[1].request;
    expect(sendRequest.headers.Authorization).toBe('Bearer access-token-1');
    expect(sendRequest.headers['Content-Type']).toBe('application/json');
    expect(sendRequest.headers['User-Agent']).toBe(
      'RAF-Consult-PMS/1.0',
    );

    const raw = (JSON.parse(sendRequest.body) as { raw: string }).raw;
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: demo.member@gmail.com');
    expect(mime).toContain(`Subject: ${MESSAGE.subject}`);
    expect(mime).toContain('Reply-To: rafconsultpms@gmail.com');
    expect(mime).toContain('Content-Type: text/plain');
    expect(mime).toContain('Content-Type: text/html');
  });

  it('uses a message-level Reply-To over the configured default', async () => {
    const { client, requests } = recordingClient(async (url) =>
      url === GMAIL_TOKEN_ENDPOINT
        ? response(200, tokenBody())
        : response(200, { id: 'message-1' }),
    );

    await senderWith(client).send({
      ...MESSAGE,
      replyTo: 'support@gmail.com',
    });

    const send = requests.at(-1)!;
    const raw = (JSON.parse(send.request.body) as { raw: string }).raw;
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toContain(
      'Reply-To: support@gmail.com',
    );
  });

  it('refreshes the cached token when it is close to expiry', async () => {
    let now = 1_000_000;
    const { client, requests } = gmailClient({
      token: () => response(200, tokenBody(`token-${now}`)),
    });

    const sender = senderWith(client, () => now);
    await sender.send(MESSAGE);
    now += 3_600_000; // past the 3600 s lifetime minus the 60 s margin
    await sender.send(MESSAGE);

    const tokenCalls = requests.filter(
      ({ url }) => url === GMAIL_TOKEN_ENDPOINT,
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it('bounds every request with the 10 s timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { client } = gmailClient({});

    await senderWith(client).send(MESSAGE);

    expect(timeout).toHaveBeenCalledWith(GMAIL_TIMEOUT_MS);
  });

  it('drops the cached token and retries once on a 401', async () => {
    let sendCalls = 0;
    let tokenCalls = 0;
    const { client, requests } = recordingClient(async (url) => {
      if (url === GMAIL_TOKEN_ENDPOINT) {
        tokenCalls += 1;
        return response(200, tokenBody(`token-${tokenCalls}`));
      }
      sendCalls += 1;
      return sendCalls === 1
        ? response(401, { error: { message: 'Invalid Credentials' } })
        : response(200, { id: 'message-1' });
    });

    await senderWith(client).send(MESSAGE);

    expect(tokenCalls).toBe(2);
    expect(sendCalls).toBe(2);
    const authorizationHeaders = requests
      .filter(({ url }) => url === GMAIL_SEND_ENDPOINT)
      .map(({ request }) => request.headers.Authorization);
    expect(authorizationHeaders).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('surfaces a second 401 instead of retrying forever', async () => {
    let tokenCalls = 0;
    const { client } = recordingClient(async (url) => {
      if (url === GMAIL_TOKEN_ENDPOINT) {
        tokenCalls += 1;
        return response(200, tokenBody());
      }
      return response(401, { error: { message: 'Invalid Credentials' } });
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    expect((caught as EmailSendError).statusCode).toBe(401);
    expect(tokenCalls).toBe(2);
  });

  it('maps a non-2xx send response to a typed error without leaking secrets', async () => {
    const { client } = gmailClient({
      send: () =>
        response(400, {
          error: { code: 400, message: 'Invalid To header' },
        }),
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('gmail-api');
    expect(sendError.statusCode).toBe(400);
    expect(sendError.providerMessage).toBe('Invalid To header');
    expect(sendError.message).not.toContain(OPTIONS.refreshToken);
    expect(sendError.message).not.toContain(OPTIONS.clientSecret);
    expect(sendError.message).not.toContain(MESSAGE.html);
  });

  it('logs a 429 as a provider rate limit without recipient or body', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { client } = gmailClient({
      send: () => response(429, { error: { message: 'Rate exceeded' } }),
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toMatchObject({ provider: 'gmail-api', statusCode: 429 });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('email_provider_rate_limited');
    expect(logged).not.toContain(OPTIONS.refreshToken);
    expect(logged).not.toContain(MESSAGE.to);
    expect(logged).not.toContain(MESSAGE.html);
  });

  it('maps an invalid_grant token response to a typed error', async () => {
    const { client } = gmailClient({
      token: () =>
        response(400, {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('gmail-api');
    expect(sendError.statusCode).toBe(400);
    expect(sendError.providerMessage).toContain('invalid_grant');
    expect(sendError.providerMessage).toContain('Token has been expired');
  });

  it('maps a token response without an access token to a typed error', async () => {
    const { client } = gmailClient({
      token: () => response(200, { expires_in: 3600 }),
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    expect((caught as EmailSendError).providerMessage).toBeUndefined();
  });

  it('maps a network failure on send to a typed error and keeps the cause', async () => {
    const failure = new TypeError('fetch failed');
    const { client } = recordingClient(async (url) => {
      if (url === GMAIL_TOKEN_ENDPOINT) {
        return response(200, tokenBody());
      }
      throw failure;
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('gmail-api');
    expect(sendError.cause).toBe(failure);
    expect(sendError.statusCode).toBeUndefined();
  });

  it('maps a network failure on the token endpoint to a typed error', async () => {
    const failure = new TypeError('fetch failed');
    const { client } = recordingClient(async () => {
      throw failure;
    });

    const caught = await catchRejection(senderWith(client).send(MESSAGE));

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('gmail-api');
    expect(sendError.cause).toBe(failure);
    expect(sendError.message).toContain('OAuth token request failed');
  });
});
