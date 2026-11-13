import { Logger } from '@nestjs/common';
import { EmailSendError } from '../email-sender.js';
import {
  ResendEmailSender,
  type ResendEmailSenderOptions,
  type ResendHttpClient,
  type ResendRequest,
  type ResendResponse,
} from './resend-email.sender.js';

const OPTIONS: ResendEmailSenderOptions = {
  apiKey: 'resend-secret-key',
  from: 'RAF CONSULT MARS <no-reply@rafconsult.test>',
  replyTo: 'admin@rafconsult.test',
};

const MESSAGE = {
  to: 'member@rafconsult.test',
  subject: 'Your RAF CONSULT MARS account is ready',
  text: 'Set your password: https://portal.rafconsult.test/reset-password?token=x',
  html: '<p>Set your password</p>',
};

const ENDPOINT = 'https://api.resend.com/emails';

function response(
  status: number,
  body: unknown = {},
  statusText = '',
): ResendResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  };
}

function recordingClient(responseBody: ResendResponse): {
  client: ResendHttpClient;
  requests: { url: string; request: ResendRequest }[];
} {
  const requests: { url: string; request: ResendRequest }[] = [];
  return {
    requests,
    client: async (url, request) => {
      requests.push({ url, request });
      return responseBody;
    },
  };
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

describe('ResendEmailSender', () => {
  it('posts both alternatives to the Resend API with the configured sender', async () => {
    const { client, requests } = recordingClient(response(202));

    await new ResendEmailSender(OPTIONS, client).send(MESSAGE);

    expect(requests).toHaveLength(1);
    const { url, request } = requests[0];
    expect(url).toBe(ENDPOINT);
    expect(request.method).toBe('POST');
    expect(request.headers.Authorization).toBe(`Bearer ${OPTIONS.apiKey}`);
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(request.body)).toEqual({
      from: OPTIONS.from,
      to: [MESSAGE.to],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
      reply_to: OPTIONS.replyTo,
    });
  });

  it('bounds the provider call with a 10 s abort signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { client, requests } = recordingClient(response(202));

    await new ResendEmailSender(OPTIONS, client).send(MESSAGE);

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(requests[0].request.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a non-2xx response to EmailSendError with status and provider message', async () => {
    const { client } = recordingClient(
      response(422, {
        statusCode: 422,
        name: 'validation_error',
        message: 'Invalid `from` address',
      }),
    );

    const caught = await catchRejection(
      new ResendEmailSender(OPTIONS, client).send(MESSAGE),
    );

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('resend');
    expect(sendError.statusCode).toBe(422);
    expect(sendError.providerMessage).toBe('Invalid `from` address');
    expect(sendError.message).not.toContain(OPTIONS.apiKey);
    expect(sendError.message).not.toContain(MESSAGE.html);
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    const client: ResendHttpClient = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new SyntaxError('not json');
      },
    });

    const caught = await catchRejection(
      new ResendEmailSender(OPTIONS, client).send(MESSAGE),
    );

    expect(caught).toMatchObject({
      provider: 'resend',
      statusCode: 500,
      providerMessage: 'Internal Server Error',
    });
  });

  it('maps a network failure to EmailSendError and keeps the cause', async () => {
    const failure = new TypeError('fetch failed');
    const client: ResendHttpClient = async () => {
      throw failure;
    };

    const caught = await catchRejection(
      new ResendEmailSender(OPTIONS, client).send(MESSAGE),
    );

    expect(caught).toBeInstanceOf(EmailSendError);
    const sendError = caught as EmailSendError;
    expect(sendError.provider).toBe('resend');
    expect(sendError.cause).toBe(failure);
    expect(sendError.statusCode).toBeUndefined();
  });

  it('logs a 429 as a provider rate limit without recipient or body', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { client, requests } = recordingClient(response(429, {}));

    const caught = await catchRejection(
      new ResendEmailSender(OPTIONS, client).send(MESSAGE),
    );

    expect(caught).toMatchObject({ provider: 'resend', statusCode: 429 });
    expect(requests).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('email_provider_rate_limited');
    expect(logged).not.toContain(OPTIONS.apiKey);
    expect(logged).not.toContain(MESSAGE.to);
    expect(logged).not.toContain(MESSAGE.html);
  });
});
