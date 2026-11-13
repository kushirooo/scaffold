import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    // Migrates the dedicated test database once per run; aborts on failure.
    globalSetup: ['./test/db/global-setup.ts'],
    // All files share one PostgreSQL database, so they must not interleave:
    // each test truncates the auth tables before it runs.
    fileParallelism: false,
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/generated/**',
        'dist/**',
      ],
    },
  },
});
