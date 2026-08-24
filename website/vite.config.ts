import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import type { ViteSSGOptions } from 'vite-ssg';
import { defineConfig } from 'vitest/config';
import Sitemap from 'vite-plugin-sitemap';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  cacheDir: '../node_modules/.vite-website',
  plugins: [
    vue(),
    Sitemap({
      hostname: 'https://beam.plinka.eu',
      dynamicRoutes: ['/faq', '/install'],
      exclude: ['/404'],
      robots: [{ userAgent: '*', allow: '/' }],
      changefreq: { '/': 'weekly', '/faq': 'monthly', '/install': 'weekly' },
      priority: { '/': 1, '/faq': 0.7, '/install': 0.8 },
      readable: true,
    }),
  ],
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
  ssgOptions: {
    dirStyle: 'flat',
  } satisfies ViteSSGOptions,
  server: {
    host: '127.0.0.1',
    port: 7000,
    strictPort: true,
    proxy: {
      '/docs': {
        target: 'http://127.0.0.1:7001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 7002,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'docs/.vitepress/**/*.test.ts'],
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
