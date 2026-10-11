import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const entries = [];
for (const theme of ['light', 'dark']) {
  const html = `<!doctype html>
<html lang="en" class="${theme === 'dark' ? 'dark' : ''}" data-demo-theme="${theme}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1280, height=800"><title>Beam · Screenshot zooms</title><link rel="icon" href="data:,"></head>
<body><div id="root" data-composition-id="still-zooms" data-start="0" data-duration="9" data-width="1280" data-height="800"><section id="app" class="clip" data-start="0" data-duration="9" data-track-index="0"></section></div><script type="module" src="./src/main.ts"></script></body></html>`;
  const path = resolve(root, `entry-${theme}.html`);
  await writeFile(path, html); entries.push(path);
}
await build({
  root, configFile: false, base: './', publicDir: false, plugins: [vue()],
  resolve: { dedupe: ['vue'], alias: [
    { find: /^.*transitions\/RafRevealTransition\.vue$/, replacement: resolve(root, 'src/SeekReveal.vue') },
    { find: '~/ui', replacement: resolve(repository, 'apps/desktop/src/components/ui') },
    { find: '~', replacement: resolve(repository, 'apps/desktop/src') },
    { find: 'vue', replacement: resolve(root, 'node_modules/vue') },
  ] },
  build: { outDir: resolve(root, '.beam/build'), emptyOutDir: true, rollupOptions: { input: entries } },
});
for (const theme of ['light', 'dark']) {
  const destination = resolve(root, 'dist', theme);
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
  let html = await readFile(resolve(root, `.beam/build/entry-${theme}.html`), 'utf8');
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
    (_, src) => `<script type="module">import '${src}'; await window.beamComposition.ready; window.__timelines['still-zooms'] = window.beamComposition.timeline;</script>`);
  await writeFile(resolve(destination, 'index.html'), html);
  await writeFile(resolve(destination, 'index.motion.json'), JSON.stringify({ duration: 9, assertions: [
    { kind: 'staysInFrame', selector: '.editor-card' },
    { kind: 'staysInFrame', selector: '.demo-cursor' },
    { kind: 'keepsMoving', withinSelector: '.world', maxStaticSec: 1.5 },
  ] }, null, 2));
  for (const file of await readdir(resolve(destination, 'assets'))) {
    if (!file.endsWith('.css')) continue;
    const path = resolve(destination, 'assets', file);
    await writeFile(path, (await readFile(path, 'utf8'))
      .replace(/transition\s*:[^;{}]+;?/g, '').replace(/animation\s*:[^;{}]+;?/g, ''));
  }
}
