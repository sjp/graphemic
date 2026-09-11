import { defineConfig } from 'vitest/config';

// The bundle suite is a separate project because it measures `dist/` rather
// than the sources: it cannot run on a clean checkout, and `npm test` has to.
// `npm run test:bundle` builds first and then points Vitest here.
export default defineConfig({
  test: {
    include: ['test/bundle/*.test.ts'],
    // Bundling six programs with two bundlers, twice each, is seconds of work.
    hookTimeout: 120_000,
  },
});
