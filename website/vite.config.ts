import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  cacheDir: '../node_modules/.vite-website',
  plugins: [vue()],
  resolve: {
    alias: {
      '~/ui': fileURLToPath(new URL('../src/components/ui', import.meta.url)),
      '~': fileURLToPath(new URL('../src', import.meta.url)),
      '@website': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 6501,
  },
  preview: {
    port: 6502,
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/vite-env.d.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
