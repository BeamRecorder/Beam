import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';
const repository = resolve(root, '../..');
const entries = [];
for (const mode of ['2d', '3d'])
  for (const theme of ['dark', 'light']) {
    const name = `${mode}-${theme}`;
    const html = `<!doctype html>
<html lang="en" ${theme === 'dark' ? 'class="dark" ' : ''}data-demo-theme="${theme}" data-demo-mode="${mode}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=1280, height=800"><title>Beam · ${mode}</title><link rel="icon" href="data:,"></head>
<body><div id="root" data-composition-id="zooms-${mode}" data-start="0" data-duration="8" data-width="1280" data-height="800"><section id="app" class="clip" data-start="0" data-duration="8" data-track-index="0"></section></div><script type="module" src="./src/main.ts"></script></body></html>`;
    const path = resolve(root, `${name}.html`);
    await writeFile(path, html);
    entries.push(path);
  }
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
    rollupOptions: { input: entries },
  },
});
await rm(resolve(root, 'dist'), { recursive: true, force: true });
for (const mode of ['2d', '3d'])
  for (const theme of ['dark', 'light']) {
    const destination = resolve(root, 'dist', `${mode}-${theme}`);
    await mkdir(destination, { recursive: true });
    await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
    let html = await readFile(resolve(root, `.beam/build/${mode}-${theme}.html`), 'utf8');
    html = html.replace(
      /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
      (_, src) =>
        `<script type="module">import '${src}';\nwindow.__timelines['zooms-${mode}'] = window.beamComposition.timeline;</script>`,
    );
    await writeFile(resolve(destination, 'index.html'), html);
    await writeFile(
      resolve(destination, 'index.motion.json'),
      JSON.stringify(
        {
          duration: 8,
          assertions: [
            { kind: 'staysInFrame', selector: '.editor-card' },
            { kind: 'staysInFrame', selector: '.demo-cursor' },
            {
              kind: 'keepsMoving',
              withinSelector: '.world',
              maxStaticSec: 1.5,
            },
          ],
        },
        null,
        2,
      ),
    );
    for (const file of await readdir(resolve(destination, 'assets'))) {
      if (!file.endsWith('.css')) continue;
      const path = resolve(destination, 'assets', file);
      // The video seek clock owns native control changes, rather than CSS transitions.
      await writeFile(path, (await readFile(path, 'utf8')).replace(/transition\s*:[^;{}]+;?/g, ''));
    }
    await cp(resolve(root, 'assets/HankenGrotesk-OFL.txt'), resolve(destination, 'HankenGrotesk-OFL.txt'));
  }
