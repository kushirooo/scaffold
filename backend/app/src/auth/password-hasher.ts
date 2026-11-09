import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify, type HashOptions } from 'argon2';

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
  hash(password: string): Promise<string> {
    return hash(password, HASH_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
