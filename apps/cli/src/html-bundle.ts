import { dirname, basename, resolve, join } from 'node:path';
import { mkdtemp, cp, copyFile, mkdir, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { HtmlPublishArguments } from './agent-types';

/** HTML/TS is the default. Vue is compiled only when the caller explicitly requests it. */
export async function prepareHtmlBundle(input: HtmlPublishArguments, baseDirectory: string) {
  const entry = resolve(baseDirectory, input.entry);
  if (!entry.endsWith('.html')) throw new Error('Composition entry must be an HTML file.');
  const temporary = await mkdtemp(join(tmpdir(), 'beam-html-'));
  const source = join(temporary, 'source'),
    bundle = join(temporary, 'bundle');
  try {
    await cp(dirname(entry), source, {
      recursive: true,
      filter: (file) => !['node_modules', '.git', '.beam', 'dist'].includes(basename(file)),
    });
    if (input.references?.length) {
      await mkdir(join(source, 'references'), { recursive: true });
      for (const reference of input.references) {
        if (!/^[\w.-]+$/.test(reference.name) || ['.', '..'].includes(reference.name))
          throw new Error('Reference names must be plain file names.');
        await copyFile(resolve(baseDirectory, reference.source), join(source, 'references', reference.name));
      }
    }
    let dependencyRoot = dirname(entry);
    while (true) {
      try {
        if ((await stat(join(dependencyRoot, 'node_modules'))).isDirectory()) {
          await symlink(join(dependencyRoot, 'node_modules'), join(source, 'node_modules'), 'junction');
          break;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const parent = dirname(dependencyRoot);
      if (parent === dependencyRoot) break;
      dependencyRoot = parent;
    }
    // Resolve dependencies from the caller's project, without persisting its node_modules.
    const { build } = await import('vite');
    const plugins = input.framework === 'vue' ? [(await import('@vitejs/plugin-vue')).default()] : [];
    await build({
      root: source,
      configFile: false,
      publicDir: false,
      base: './',
      logLevel: 'silent',
      plugins,
      build: { outDir: bundle, emptyOutDir: true, rollupOptions: { input: join(source, basename(entry)) } },
    });
    if (input.references?.length) await cp(join(source, 'references'), join(bundle, 'references'), { recursive: true });
    return {
      sourceDirectory: source,
      bundleDirectory: bundle,
      entry: basename(entry),
      dispose: () => rm(temporary, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
