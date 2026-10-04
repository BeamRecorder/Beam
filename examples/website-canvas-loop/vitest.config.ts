import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Native Vue/canvas/WebCodecs integration is exercised by verify.mjs.
      include: ['src/motion.ts', 'src/video.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reporter: ['text', 'json-summary'],
      reportsDirectory: '.beam/coverage',
    },
  },
});
