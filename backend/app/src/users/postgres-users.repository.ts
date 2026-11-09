/**
 * Deprecated compatibility shim.
 *
 * `src/auth/auth.module.ts` is owned by Phase 2 (US01 reconciliation) and is
 * not edited in T1, so it still imports `PostgresUsersRepository`. The real
 * implementation now lives in `prisma-users.repository.ts`. Delete this file
 * together with the AuthModule provider update in Phase 2.
 */
export { PrismaUsersRepository as PostgresUsersRepository } from './prisma-users.repository.js';
