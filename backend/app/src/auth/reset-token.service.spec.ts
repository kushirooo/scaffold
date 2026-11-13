import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { CreateResetTokenInput } from '../reset-tokens/reset-token.types.js';
import type { ResetTokensRepository } from '../reset-tokens/reset-tokens.repository.js';
import { ResetTokenService } from './reset-token.service.js';

class RecordingResetTokensRepository implements ResetTokensRepository {
  readonly calls: CreateResetTokenInput[] = [];

  async replaceUnused(input: CreateResetTokenInput): Promise<void> {
    this.calls.push({ ...input });
  }
}

function serviceWith(ttlSeconds: number): {
  service: ResetTokenService;
  repository: RecordingResetTokensRepository;
} {
  const repository = new RecordingResetTokensRepository();
  const config = new ConfigService({ INVITE_TTL_SECONDS: ttlSeconds });
  return { service: new ResetTokenService(repository, config), repository };
}

/** Config without the key: only the service's documented default applies. */
function configWithoutInviteTtl(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

describe('ResetTokenService', () => {
  it('issues a 43-character base64url token', async () => {
    const { service } = serviceWith(86_400);

    const { rawToken } = await service.issueInvite('user-1');

    expect(rawToken).toHaveLength(43);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores only the SHA-256 hex digest, never the raw token', async () => {
    const { service, repository } = serviceWith(86_400);

    const { rawToken } = await service.issueInvite('user-1');

    const [call] = repository.calls;
    const expectedHash = createHash('sha256')
      .update(rawToken, 'utf8')
      .digest('hex');
    expect(call.tokenHash).toBe(expectedHash);
    expect(call.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(call)).not.toContain(rawToken);
  });

  it('persists the INVITE purpose, user and configured TTL', async () => {
    const { service, repository } = serviceWith(3_600);
    const before = Date.now();

    const { expiresAt } = await service.issueInvite('user-1');

    const after = Date.now();
    const [call] = repository.calls;
    expect(call.userId).toBe('user-1');
    expect(call.purpose).toBe('INVITE');
    expect(call.expiresAt).toBe(expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 3_600_000);
  });

  it('defaults to a 24-hour TTL when the config omits INVITE_TTL_SECONDS', async () => {
    const repository = new RecordingResetTokensRepository();
    const service = new ResetTokenService(
      repository,
      configWithoutInviteTtl(),
    );
    const before = Date.now();

    const { expiresAt } = await service.issueInvite('user-1');

    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 86_400_000);
  });

  it('issues a fresh random token on every call', async () => {
    const { service, repository } = serviceWith(86_400);

    const first = await service.issueInvite('user-1');
    const second = await service.issueInvite('user-1');

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(repository.calls).toHaveLength(2);
  });
});
