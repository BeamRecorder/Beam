import { build } from 'vite';
import { spawnSync } from 'node:child_process';
import vue from '@vitejs/plugin-vue';
import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const outputRoot = resolve(root, process.env.BEAM_DEMO_DIST || 'dist');
const frameDirectory = resolve(root, '.beam/frames');
await rm(frameDirectory, { recursive: true, force: true });
await mkdir(frameDirectory, { recursive: true });
const decoded = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    resolve(root, 'assets/taking-breath.webm'),
    '-vf',
    'scale=396:704',
    '-fps_mode',
    'passthrough',
    '-c:v',
    'libwebp',
    '-quality',
    '86',
    resolve(frameDirectory, '%03d.webp'),
  ],
  { stdio: 'inherit' },
);
if (decoded.status !== 0) throw new Error('Decoding the supplied footage requires external FFmpeg.');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
await writeFile(
  resolve(root, 'light.html'),
  html.replace('class="dark" data-demo-theme="dark"', 'data-demo-theme="light"'),
);
await build({
  root,
  configFile: false,
  base: './',
  publicDir: false,
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '~/ui': resolve(repository, 'apps/desktop/src/components/ui'),
      '~': resolve(repository, 'apps/desktop/src'),
      vue: resolve(root, 'node_modules/vue'),
    },
  },
  build: {
    outDir: resolve(root, '.beam/build'),
    emptyOutDir: true,
    rollupOptions: { input: [resolve(root, 'index.html'), resolve(root, 'light.html')] },
  },
});
for (const theme of ['dark', 'light']) {
  const destination = resolve(outputRoot, theme);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
  let entry = await readFile(resolve(root, '.beam/build', theme === 'dark' ? 'index.html' : 'light.html'), 'utf8');
  entry = entry.replace(
    /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
    (_, src) =>
      `<script type="module">import '${src}';\nawait window.beamComposition.ready;\nwindow.__timelines['recording-breath'] = window.beamComposition.timeline;</script>`,
  );
  await writeFile(resolve(destination, 'index.html'), entry);
  // Native controls keep their exact appearance, but all motion belongs to the seek clock.
  for (const asset of await readdir(resolve(destination, 'assets'))) {
    if (!asset.endsWith('.css')) continue;
    const path = resolve(destination, 'assets', asset);
    const css = (await readFile(path, 'utf8'))
      .replace(/transition\s*:[^;{}]+;?/g, '')
      .replace(/animation\s*:[^;{}]+;?/g, '');
    await writeFile(path, css);
  }
}
