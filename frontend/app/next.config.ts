import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Automatic Instant Navigation validation flags every route that is not
    // instant yet; keep it opt-in until the pages opt in explicitly (k330).
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
  turbopack: {
    // Pin the project root so Turbopack does not infer a parent workspace root
    // (and warn about it) when the app is run from this directory.
    root: path.resolve(process.cwd()),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * The reset token travels in the query string by design, so the reset page
   * must not leak it through the Referer header (US19; docs/api-contract-us18-us19.md §6).
   */
  async headers() {
    return [
      {
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
