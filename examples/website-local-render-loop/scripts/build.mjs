import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFile, writeFile, cp, mkdir, rm, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
      vue: resolve(root, 'node_modules/vue'),
    },
  },
  build: {
    outDir: resolve(root, '.beam/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: [resolve(root, 'index.html'), resolve(root, 'light.html')],
    },
  },
});
await rm(resolve(root, 'dist'), { recursive: true, force: true });
for (const theme of ['dark', 'light']) {
  const destination = resolve(root, 'dist', theme);
  await mkdir(destination, { recursive: true });
  await cp(resolve(root, '.beam/build/assets'), resolve(destination, 'assets'), { recursive: true });
  let entry = await readFile(resolve(root, '.beam/build', theme === 'dark' ? 'index.html' : 'light.html'), 'utf8');
  // Import every Vite entry before registering its completed timeline.
  const modulePattern = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g;
  const imports = [...entry.matchAll(modulePattern)].map((match) => `import '${match[1]}';`).join('\n');
  entry = entry
    .replace(modulePattern, '')
    .replace(
      '</head>',
      `<script type="module">${imports}\nwindow.__timelines['local-render'] = window.beamComposition.timeline;</script></head>`,
    );
  await writeFile(resolve(destination, 'index.html'), entry);
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
