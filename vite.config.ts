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
  base: './',
  cacheDir: 'node_modules/.vite',
  plugins: [publicBackgroundMediaPlugin(), vue({})],
  resolve: {
    alias: {
      '~/ui': fileURLToPath(new URL('./src/components/ui', import.meta.url)),
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./editor.html', import.meta.url)),
        teleprompter: fileURLToPath(new URL('./teleprompter.html', import.meta.url)),
        onboarding: fileURLToPath(new URL('./onboarding.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 6500,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
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
