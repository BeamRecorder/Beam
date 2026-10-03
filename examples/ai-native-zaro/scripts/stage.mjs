import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Persist editable code and runtime assets, keeping inspection frames outside Beam's source bundle. */
export async function stageComposition(root) {
  const destination = resolve(root, '.beam/publish');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of ['index.html', 'package.json', 'bun.lock', 'src', 'references/ui', 'references/fonts']) {
    await cp(resolve(root, file), resolve(destination, file), { recursive: true });
  }
  return destination;
}
