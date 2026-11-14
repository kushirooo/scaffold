import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type {
  CreateResetTokenInput,
  ResetTokenRecord,
} from '../reset-tokens/reset-token.types.js';
import type { ResetTokensRepository } from '../reset-tokens/reset-tokens.repository.js';
import { ResetTokenService } from './reset-token.service.js';

class RecordingResetTokensRepository implements ResetTokensRepository {
  readonly calls: CreateResetTokenInput[] = [];
  readonly lookups: string[] = [];
  readonly records = new Map<string, ResetTokenRecord>();

  async replaceUnused(input: CreateResetTokenInput): Promise<void> {
    this.calls.push({ ...input });
  }

  async findByTokenHash(tokenHash: string): Promise<ResetTokenRecord | null> {
    this.lookups.push(tokenHash);
    return this.records.get(tokenHash) ?? null;
  }
}

function serviceWith(env: Record<string, number> = {}): {
  service: ResetTokenService;
  repository: RecordingResetTokensRepository;
} {
  const repository = new RecordingResetTokensRepository();
  const config = new ConfigService(env);
  return { service: new ResetTokenService(repository, config), repository };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function expectTtl(
  expiresAt: Date,
  before: number,
  after: number,
  ttlSeconds: number,
): void {
  expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
    before + ttlSeconds * 1000,
  );
  expect(expiresAt.getTime()).toBeLessThanOrEqual(after + ttlSeconds * 1000);
}

describe('ResetTokenService', () => {
  describe('issueInvite', () => {
    it('issues a 43-character base64url token with 32 bytes of entropy', async () => {
      const { service } = serviceWith({ INVITE_TTL_SECONDS: 86_400 });

      const { rawToken } = await service.issueInvite('user-1');

      expect(rawToken).toHaveLength(43);
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    });

    it('stores only the SHA-256 hex digest, never the raw token', async () => {
      const { service, repository } = serviceWith({
        INVITE_TTL_SECONDS: 86_400,
      });

      const { rawToken } = await service.issueInvite('user-1');

      const [call] = repository.calls;
      const expectedHash = sha256Hex(rawToken);
      expect(call.tokenHash).toBe(expectedHash);
      expect(call.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(call.tokenHash).not.toBe(rawToken);
      expect(JSON.stringify(call)).not.toContain(rawToken);
    });

    it('persists the INVITE purpose, user and configured TTL', async () => {
      const { service, repository } = serviceWith({ INVITE_TTL_SECONDS: 3_600 });
      const before = Date.now();

      const { expiresAt } = await service.issueInvite('user-1');

      const after = Date.now();
      const [call] = repository.calls;
      expect(call.userId).toBe('user-1');
      expect(call.purpose).toBe('INVITE');
      expect(call.expiresAt).toBe(expiresAt);
      expectTtl(expiresAt, before, after, 3_600);
    });

    it('defaults to a 24-hour TTL when the config omits INVITE_TTL_SECONDS', async () => {
      const { service, repository } = serviceWith();
      const before = Date.now();

      const { expiresAt } = await service.issueInvite('user-1');

      const after = Date.now();
      expectTtl(expiresAt, before, after, 86_400);
      expect(repository.calls[0].purpose).toBe('INVITE');
    });
  });

  describe('issueReset', () => {
    it('issues a 43-character base64url token with 32 bytes of entropy', async () => {
      const { service } = serviceWith({ RESET_TTL_SECONDS: 900 });

      const { rawToken } = await service.issueReset('user-1');

      expect(rawToken).toHaveLength(43);
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    });

    it('stores only the SHA-256 hex digest of the raw reset token', async () => {
      const { service, repository } = serviceWith({ RESET_TTL_SECONDS: 900 });

      const { rawToken } = await service.issueReset('user-1');

      const [call] = repository.calls;
      expect(call.tokenHash).toBe(sha256Hex(rawToken));
      expect(call.tokenHash).not.toBe(rawToken);
      expect(JSON.stringify(call)).not.toContain(rawToken);
    });

    it('persists purpose RESET, so INVITE rows are not invalidated', async () => {
      const { service, repository } = serviceWith({ RESET_TTL_SECONDS: 900 });

      await service.issueReset('user-1');

      expect(repository.calls[0].purpose).toBe('RESET');
      expect(repository.calls[0].userId).toBe('user-1');
    });

    it('expires after RESET_TTL_SECONDS and defaults to 900 seconds', async () => {
      const configured = serviceWith({ RESET_TTL_SECONDS: 60 });
      const configuredBefore = Date.now();
      const configuredToken = await configured.service.issueReset('user-1');
      const configuredAfter = Date.now();
      expectTtl(configuredToken.expiresAt, configuredBefore, configuredAfter, 60);

      const defaulted = serviceWith();
      const defaultBefore = Date.now();
      const defaultToken = await defaulted.service.issueReset('user-1');
      const defaultAfter = Date.now();
      expectTtl(defaultToken.expiresAt, defaultBefore, defaultAfter, 900);
    });
  });

  describe('resetTtlSeconds', () => {
    it('exposes the configured reset lifetime for email copy', () => {
      const { service } = serviceWith({ RESET_TTL_SECONDS: 60 });

      expect(service.resetTtlSeconds).toBe(60);
    });

    it('defaults to 900 seconds (15 minutes)', () => {
      expect(serviceWith().service.resetTtlSeconds).toBe(900);
    });
  });

  describe('findByRawToken', () => {
    it('hashes the raw token before the lookup and returns the stored row', async () => {
      const { service, repository } = serviceWith({ RESET_TTL_SECONDS: 900 });
      const { rawToken } = await service.issueReset('user-1');
      const tokenHash = sha256Hex(rawToken);
      const record: ResetTokenRecord = {
        id: 'token-1',
        userId: 'user-1',
        tokenHash,
        purpose: 'RESET',
        expiresAt: new Date(Date.now() + 900_000),
        usedAt: null,
      };
      repository.records.set(tokenHash, record);

      const found = await service.findByRawToken(rawToken);

      expect(repository.lookups).toEqual([tokenHash]);
      expect(found).toEqual(record);
      expect(JSON.stringify(repository.lookups)).not.toContain(rawToken);
    });

    it('returns null for an unknown raw token without exposing it', async () => {
      const { service, repository } = serviceWith();

      await expect(
        service.findByRawToken('not-a-real-token'),
      ).resolves.toBeNull();
      expect(repository.lookups).toEqual([sha256Hex('not-a-real-token')]);
    });
  });

  it('issues a fresh random token on every call', async () => {
    const { service, repository } = serviceWith({ INVITE_TTL_SECONDS: 86_400 });

    const first = await service.issueInvite('user-1');
    const second = await service.issueInvite('user-1');

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(repository.calls).toHaveLength(2);
  });
});
