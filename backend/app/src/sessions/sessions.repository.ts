import type { CreateSessionInput, Session } from './session.types.js';

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');

export interface SessionsRepository {
  create(input: CreateSessionInput): Promise<Session>;
  /** Returns the session only when it exists, is unrevoked and has not expired. */
  findActiveById(id: string): Promise<Session | null>;
  revoke(id: string): Promise<boolean>;
}
