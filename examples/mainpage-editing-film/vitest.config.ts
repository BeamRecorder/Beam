import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/motion.ts', 'src/scene-model.ts', 'src/selection.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
      reportsDirectory: '.beam/coverage',
      reporter: ['text', 'json-summary'],
    },
  },
});
