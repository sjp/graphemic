import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      // The library is small enough, and its tests thorough enough, that every
      // line and branch is already reached without the generated-input
      // properties helping. Anything less than full coverage is now a gap
      // someone introduced rather than a corner nobody got to.
      thresholds: { statements: 100, lines: 100, branches: 100, functions: 100 },
    },
  },
});
