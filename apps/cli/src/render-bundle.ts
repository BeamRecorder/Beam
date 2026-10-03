import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';

/** Compile only the encoder host; no desktop config, Vue plugin or source-file server. */
export async function buildRenderBundle(directory: string) {
  if (process.env.BEAM_COMPILED_CLI === 'true')
    return listBundle(fileURLToPath(new URL('./browser/', import.meta.url)));
  if (process.env.BEAM_CLI_BROWSER_ROOT) return listBundle(process.env.BEAM_CLI_BROWSER_ROOT);
  const { build } = await import('vite');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const desktopRoot = fileURLToPath(new URL('../../../', import.meta.url));
  await build({
    root,
    configFile: false,
    base: '/',
    publicDir: false,
    logLevel: 'silent',
    worker: { format: 'es' },
    build: {
      outDir: directory,
      emptyOutDir: true,
      modulePreload: { polyfill: false },
      rollupOptions: { input: [resolve(root, 'export.html'), resolve(root, 'gpu-export.html')] },
    },
  });
  const files = await listBundle(directory);
  files.set('/brand/BeamIcon.webp', resolve(desktopRoot, 'public/brand/BeamIcon.webp'));
  return files;
}

export async function listBundle(directory: string) {
  const files = new Map<string, string>();
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const file = resolve(entry.parentPath, entry.name);
    files.set('/' + relative(directory, file).split(sep).join('/'), file);
  }
  return files;
}
