import { PasswordHasher } from './password-hasher.js';

/** Maps printable ASCII to its fullwidth form, whose NFKC form is the input. */
function fullwidth(value: string): string {
  return Array.from(value, (character) =>
    String.fromCodePoint((character.codePointAt(0) ?? 0) + 0xfee0),
  ).join('');
}

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

  describe('NFKC normalisation', () => {
    it('hashes the NFKC form, so an NFD equivalent verifies', async () => {
      const digest = await hasher.hash('passphrase-café');

      await expect(
        hasher.verify(digest, 'passphrase-cafe\u0301'),
      ).resolves.toBe(true);
    });

    it('verifies an ASCII hash with a fullwidth NFKC equivalent input', async () => {
      const digest = await hasher.hash('ascii-passphrase-only');

      await expect(
        hasher.verify(digest, fullwidth('ascii-passphrase-only')),
      ).resolves.toBe(true);
    });

    it('hashes a fullwidth input to the same normalised bytes as its ASCII form', async () => {
      const digest = await hasher.hash(fullwidth('ascii-passphrase-only'));

      await expect(
        hasher.verify(digest, 'ascii-passphrase-only'),
      ).resolves.toBe(true);
    });
  });
});
