import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
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
