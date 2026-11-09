import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      // `src/generated/` is recreated by `prisma generate`; `dist/` is build
      // output. Neither is source we own or test.
      exclude: [
        ...coverageConfigDefaults.exclude,
        'src/generated/**',
        'dist/**',
      ],
    },
  },
});
