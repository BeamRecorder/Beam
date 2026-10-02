import { packageCliCompiler } from './package-cli-compiler.mjs';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build as buildBrowser } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'apps/cli/dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await buildBrowser({
  root: resolve(root, 'apps/cli'),
  configFile: false,
  publicDir: false,
  base: '/',
  logLevel: 'warn',
  worker: { format: 'es' },
  build: {
    outDir: resolve(output, 'browser'),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: { input: resolve(root, 'apps/cli/export.html') },
  },
});
await mkdir(resolve(output, 'browser/brand'), { recursive: true });
await cp(resolve(root, 'public/brand/BeamIcon.webp'), resolve(output, 'browser/brand/BeamIcon.webp'));
const result = await Bun.build({
  entrypoints: [resolve(root, 'apps/cli/src/index.ts')],
  outdir: output,
  target: 'node',
  format: 'esm',
  splitting: true,
  minify: true,
  external: ['vite', '@vitejs/plugin-vue'],
  define: {
    'process.env.BEAM_COMPILED_CLI': '"true"',
    'process.env.BEAM_APP_VERSION': JSON.stringify(
      JSON.parse(await Bun.file(resolve(root, 'package.json')).text()).version,
    ),
  },
  naming: { entry: '[name].mjs', chunk: '[name]-[hash].mjs' },
});
if (!result.success) throw new AggregateError(result.logs, 'CLI compilation failed.');
await packageCliCompiler(root, output);
await writeFile(
  resolve(output, 'version.json'),
  JSON.stringify({
    version: JSON.parse(await Bun.file(resolve(root, 'package.json')).text()).version,
  }),
);
process.stdout.write(`Built Beam CLI and browser backend in ${output}\n`);
