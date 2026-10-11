import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFile, writeFile, cp, mkdir, rm, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artworkOnly = process.argv[2] === 'artwork';
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const artwork = await readFile(resolve(root, 'artwork/scene.html'), 'utf8');
await writeFile(
  resolve(root, 'artwork/light.html'),
  artwork.replace('class="dark" data-demo-theme="dark"', 'data-demo-theme="light"'),
);
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
      vue: resolve(root, 'node_modules/vue'),
    },
  },
  build: {
    outDir: resolve(root, '.beam/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: (artworkOnly
        ? ['artwork/scene.html', 'artwork/light.html']
        : ['index.html', 'light.html', 'artwork/scene.html', 'artwork/light.html']
      ).map((name) => resolve(root, name)),
    },
  },
});
await rm(resolve(root, 'dist'), { recursive: true, force: true });
for (const theme of ['dark', 'light']) {
  const destination = resolve(root, 'dist', theme);
  await mkdir(destination, { recursive: true });
  await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
  for (const [file, id] of artworkOnly
    ? [['artwork/scene.html', 'artwork']]
    : [
        ['artwork/scene.html', 'artwork'],
        ['index.html', 'motion-still'],
      ]) {
    const input = theme === 'dark' ? file : file === 'index.html' ? 'light.html' : 'artwork/light.html';
    let entry = await readFile(resolve(root, '.beam/build', input), 'utf8');
    const modulePattern = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g;
    const imports = [...entry.matchAll(modulePattern)].map((match) => `import '${match[1]}';`).join('\n');
    entry = entry
      .replace(modulePattern, '')
      .replace(
        '</head>',
        `<script type="module">${imports}\nwindow.__timelines['${id}'] = window.beamComposition.timeline;</script></head>`,
      );
    entry = entry.replace(/(?:\.\.\/)+assets\//g, './assets/');
    const output = id === 'artwork' ? resolve(root, 'dist/artwork', theme) : destination;
    await mkdir(output, { recursive: true });
    if (id === 'artwork') await cp(resolve(root, '.beam/build/assets'), resolve(output, 'assets'), { recursive: true });
    await writeFile(resolve(output, id === 'artwork' ? 'scene.html' : 'index.html'), entry);
  }
  for (const asset of await readdir(resolve(destination, 'assets'))) {
    if (!asset.endsWith('.css')) continue;
    const path = resolve(destination, 'assets', asset);
    // This is a rendered demo, so copied UI hover transitions must not add clocks.
    const css = (await readFile(path, 'utf8')).replace(/transition\s*:[^;{}]+;?/g, '');
    await writeFile(path, css);
  }
  for (const name of ['HankenGrotesk-OFL.txt', 'NotoSansMono-OFL.txt']) {
    await cp(resolve(root, 'assets', name), resolve(destination, name));
  }
}
