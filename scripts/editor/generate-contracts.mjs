import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { emitTypes } from './schema-types.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const result = spawnSync('cargo', ['run', '--quiet', '--offline', '-p', 'beam-editor-domain', '--example', 'editor-contracts'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(result.stderr || 'Rust schema generation failed');
const schema = JSON.parse(result.stdout);
const files = new Map([
  ['packages/editor-sdk/src/generated/schema.json', JSON.stringify(schema, null, 2) + '\n'],
  ['packages/editor-sdk/src/generated/contracts.ts', emitTypes(schema)],
  ['packages/beam-ui/src/solid/editor/shared/generated/editorContracts.ts', emitTypes(schema)],
]);
for (const [name, content] of files) {
  const path = resolve(root, name);
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error(`Generated contract drift: ${name}`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}
