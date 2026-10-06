import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/*.test.ts'], environment: 'node', coverage: {
  provider: 'v8', include: ['src/motion.ts', 'src/scene-model.ts'],
  thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
  reporter: ['text'], reportsDirectory: '.beam/coverage',
} } });
