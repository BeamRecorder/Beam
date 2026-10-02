import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const PUBLIC_BACKGROUND_MEDIA_MODULE = 'virtual:public-background-media';
const RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE = '\0' + PUBLIC_BACKGROUND_MEDIA_MODULE;
const WALLPAPER_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.jpeg', '.jpg', '.png', '.webp']);
const WALLPAPER_VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.ogv', '.webm']);

const collectPublicBackgroundMedia = (
  directory: string,
  publicRoot: string,
  extensions: ReadonlySet<string>,
): string[] => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...collectPublicBackgroundMedia(absolutePath, publicRoot, extensions));
      continue;
    }
    if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) continue;

    const publicPath = path.relative(publicRoot, absolutePath).split(path.sep).join('/');
    paths.push(`./${publicPath}`);
  }

  return paths.sort();
};

const publicBackgroundMediaPlugin = (): Plugin => ({
  name: 'public-background-media',
  resolveId(id) {
    return id === PUBLIC_BACKGROUND_MEDIA_MODULE ? RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE : undefined;
  },
  load(id) {
    if (id !== RESOLVED_PUBLIC_BACKGROUND_MEDIA_MODULE) return undefined;
    const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
    const imagePaths = collectPublicBackgroundMedia(
      path.join(publicRoot, 'wallpapers', 'image'),
      publicRoot,
      WALLPAPER_IMAGE_EXTENSIONS,
    );
    const videoPaths = collectPublicBackgroundMedia(
      path.join(publicRoot, 'wallpapers', 'video'),
      publicRoot,
      WALLPAPER_VIDEO_EXTENSIONS,
    );
    return `export const images = ${JSON.stringify(imagePaths)}; export const videos = ${JSON.stringify(videoPaths)}; export default { images, videos };`;
  },
});

// https://vite.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('./apps/desktop', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: './',
  cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
  plugins: [publicBackgroundMediaPlugin(), vue({})],
  resolve: {
    // Keep libraries such as Lucide on the renderer's Vue instance even when
    // the dependency tree was installed by a different package manager.
    dedupe: ['vue'],
    alias: {
      '~/ui': fileURLToPath(new URL('./apps/desktop/src/components/ui', import.meta.url)),
      '@desktop': fileURLToPath(new URL('./apps/desktop/src', import.meta.url)),
      '~': fileURLToPath(new URL('./apps/desktop/src', import.meta.url)),
    },
  },
  // The AAC encoder is first imported dynamically from the export worker.
  // Pre-bundle it at dev-server startup so the first export does not trigger
  // Vite's late dependency discovery and a full renderer reload.
  optimizeDeps: {
    include: ['@mediabunny/aac-encoder'],
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // Every desktop renderer runs on Electron's current Chromium.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./apps/desktop/html/index.html', import.meta.url)),
        quickSnipStatus: fileURLToPath(
          new URL('./apps/desktop/html/quick-snip-status.html', import.meta.url),
        ),
        regionMarker: fileURLToPath(new URL('./apps/desktop/html/region-marker.html', import.meta.url)),
        screenRegion: fileURLToPath(new URL('./apps/desktop/html/screen-region.html', import.meta.url)),
        countdown: fileURLToPath(new URL('./apps/desktop/html/countdown.html', import.meta.url)),
        editor: fileURLToPath(new URL('./apps/desktop/html/editor.html', import.meta.url)),
        teleprompter: fileURLToPath(new URL('./apps/desktop/html/teleprompter.html', import.meta.url)),
        hudPanel: fileURLToPath(new URL('./apps/desktop/html/hud-panel.html', import.meta.url)),
        onboarding: fileURLToPath(new URL('./apps/desktop/html/onboarding.html', import.meta.url)),
        sourcePicker: fileURLToPath(new URL('./apps/desktop/html/source-picker.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 6500,
  },
  test: {
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['apps/desktop/src/**/*.{ts,vue}', 'packages/**/src/**/*.ts', 'apps/cli/src/**/*.ts'],
      exclude: ['**/*.test.ts', 'apps/desktop/src/vite-env.d.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
