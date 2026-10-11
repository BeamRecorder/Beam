import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/scene-state.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ['text', 'json-summary'],
      reportsDirectory: '.beam/coverage',
    },
  },
});
