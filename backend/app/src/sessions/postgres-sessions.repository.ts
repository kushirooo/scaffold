/**
 * Deprecated compatibility shim.
 *
 * `src/auth/auth.module.ts` is owned by Phase 2 (US01 reconciliation) and is
 * not edited in T1, so it still imports `PostgresSessionsRepository`. The real
 * implementation now lives in `prisma-sessions.repository.ts`. Delete this file
 * together with the AuthModule provider update in Phase 2.
 */
export { PrismaSessionsRepository as PostgresSessionsRepository } from './prisma-sessions.repository.js';
