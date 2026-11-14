import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();
  const password = 'a long passphrase with spaces and ünïcode';

  it('hashes with argon2id, never in plain text', async () => {
    const digest = await hasher.hash(password);

    expect(digest).toMatch(/^\$argon2id\$/);
    expect(digest).not.toContain(password);
  });

  it('verifies the correct password', async () => {
    const digest = await hasher.hash(password);
    await expect(hasher.verify(digest, password)).resolves.toBe(true);
  });

  it('rejects a wrong password and a malformed digest', async () => {
    const digest = await hasher.hash(password);
    await expect(hasher.verify(digest, 'wrong')).resolves.toBe(false);
    await expect(hasher.verify('not-a-digest', password)).resolves.toBe(false);
  });
});
