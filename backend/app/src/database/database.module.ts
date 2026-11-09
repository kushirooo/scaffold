/**
 * Deprecated compatibility shim.
 *
 * `src/auth/auth.module.ts` is owned by Phase 2 (US01 reconciliation) and is
 * not edited in T1, so it still imports `DatabaseModule`. `PrismaModule` is the
 * database module from T1 onward. Delete this file with the AuthModule update.
 */
export { PrismaModule as DatabaseModule } from '../prisma/prisma.module.js';
