import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFile, writeFile, mkdir, cp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const variants = ['glass', 'automatic'].flatMap((kind) =>
  ['dark', 'light'].map((theme) => ({ kind, theme, name: `entry-${kind}-${theme}.html` })),
);
for (const { kind, theme, name } of variants)
  await writeFile(
    resolve(root, name),
    html
      .replace('data-demo-kind="glass"', `data-demo-kind="${kind}"`)
      .replace(
        'class="dark" data-demo-theme="dark"',
        `class="${theme === 'dark' ? 'dark' : ''}" data-demo-theme="${theme}"`,
      ),
  );
await build({
  root,
  configFile: false,
  base: './',
  publicDir: false,
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: [
      { find: /^.*transitions\/RafRevealTransition\.vue$/, replacement: resolve(root, 'src/SeekReveal.vue') },
      { find: '~/utils/public-asset', replacement: resolve(root, 'src/public-asset.ts') },
      { find: '~/ui', replacement: resolve(repository, 'apps/desktop/src/components/ui') },
      { find: '~', replacement: resolve(repository, 'apps/desktop/src') },
      { find: 'vue', replacement: resolve(root, 'node_modules/vue') },
    ],
  },
  build: {
    outDir: resolve(root, '.beam/build'),
    emptyOutDir: true,
    rollupOptions: { input: variants.map((v) => resolve(root, v.name)) },
  },
});
for (const { kind, theme, name } of variants) {
  const destination = resolve(root, 'dist', `${kind}-${theme}`);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
  let entry = await readFile(resolve(root, '.beam/build', name), 'utf8');
  entry = entry.replace(
    /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/,
    (_, src) =>
      `<script type="module">import '${src}'; await window.beamComposition.ready; window.__timelines['glass-loops'] = window.beamComposition.timeline;</script>`,
  );
  await writeFile(resolve(destination, 'index.html'), entry);
  for (const asset of await readdir(resolve(destination, 'assets'))) {
    if (!asset.endsWith('.css')) continue;
    const path = resolve(destination, 'assets', asset);
    const css = (await readFile(path, 'utf8'))
      .replace(/transition\s*:[^;{}]+;?/g, '')
      .replace(/animation\s*:[^;{}]+;?/g, '');
    await writeFile(path, css);
  }
}
