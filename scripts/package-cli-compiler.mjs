import { createRequire } from 'node:module';
import { cp, readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Preserve the installed compiler dependency graph, including the current platform's native bundler. */
export async function packageCliCompiler(root, output) {
  const installed = new Map();
  const resolvePackage = async (name, from) => {
    const require = createRequire(join(from, 'package.json'));
    let entry;
    try { entry = require.resolve(`${name}/package.json`); }
    catch { entry = require.resolve(name); }
    let directory = dirname(entry);
    while (directory !== dirname(directory)) {
      try {
        const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (manifest.name === name) return { directory, manifest };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = dirname(directory);
    }
    throw new Error(`Compiler dependency unavailable: ${name}`);
  };
  const copy = async (name, from, requester = output, optional = false) => {
    let source;
    try { source = await resolvePackage(name, from); }
    catch (error) { if (optional && error.code === 'MODULE_NOT_FOUND') return; throw error; }
    const global = join(output, 'node_modules', name);
    const destination = installed.has(global) && installed.get(global) !== source.manifest.version
      ? join(requester, 'node_modules', name) : global;
    if (installed.get(destination) === source.manifest.version) return;
    installed.set(destination, source.manifest.version);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source.directory, destination, { recursive: true, dereference: true,
      filter: (path) => !path.slice(source.directory.length).split(/[\\/]/).includes('node_modules'),
    });
    for (const dependency of Object.keys(source.manifest.dependencies ?? {}))
      await copy(dependency, source.directory, destination);
    for (const dependency of Object.keys(source.manifest.optionalDependencies ?? {}))
      await copy(dependency, source.directory, destination, true);
    // The Vue compiler resolves its declared framework peer during .vue compilation.
    if (name === '@vitejs/plugin-vue') await copy('vue', source.directory, destination);
  };
  await copy('vite', root); await copy('@vitejs/plugin-vue', root);
}
