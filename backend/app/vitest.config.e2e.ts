import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Migrates and seeds the dedicated e2e database once per run; refuses to
    // run against the development database.
    globalSetup: ['./test/e2e/global-setup.ts'],
    // Points every worker's app at the e2e database and seed password.
    setupFiles: ['./test/e2e/setup.ts'],
    coverage: {
      // Kept in sync with `vitest.config.ts` so a `--coverage` e2e run never
      // reports the generated Prisma client or build output as source.
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/generated/**',
        'dist/**',
      ],
    },
  },
});
