import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify, type HashOptions } from 'argon2';
import { normalisePassword } from './password-policy.js';

/**
 * OWASP Password Storage Cheat Sheet baseline for argon2id (19 MiB, t=2, p=1).
 * Parameters live in one place so US19 and US18 hash exactly like US01.
 */
const HASH_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordHasher {
  /**
   * Hashes the NFKC-normalised form, the same form the policy measured and the
   * seed/reset flows accepted, so every writer agrees on the bytes hashed.
   */
  hash(password: string): Promise<string> {
    return hash(normalisePassword(password), HASH_OPTIONS);
  }

  /**
   * Verifies against the same normalised form, so a password typed in an
   * equivalent Unicode form (NFC/NFD, fullwidth) still logs in (ADR 0003).
   */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, normalisePassword(password));
    } catch {
      return false;
    }
  }
}
