import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { stageComposition } from '../scripts/stage.mjs';

async function fixture(run) {
  const root = await mkdtemp(resolve(tmpdir(), 'beam-zaro-stage-'));
  try {
    for (const path of ['src', 'references/ui', 'references/fonts', 'references/frames', 'references/video']) {
      await mkdir(resolve(root, path), { recursive: true });
      await writeFile(resolve(root, path, 'asset'), path);
    }
    for (const file of ['index.html', 'package.json', 'bun.lock']) await writeFile(resolve(root, file), file);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('publication includes editable source and local runtime assets', async () =>
  fixture(async (root) => {
    const destination = await stageComposition(root);
    for (const file of [
      'index.html',
      'package.json',
      'bun.lock',
      'src/asset',
      'references/ui/asset',
      'references/fonts/asset',
    ]) {
      assert.ok((await stat(resolve(destination, file))).isFile());
    }
  }));

test('publication excludes original video and inspection frames while preserving the reference', async () =>
  fixture(async (root) => {
    const destination = await stageComposition(root);
    for (const file of ['references/video/asset', 'references/frames/asset']) {
      await assert.rejects(stat(resolve(destination, file)), { code: 'ENOENT' });
      assert.ok((await stat(resolve(root, file))).isFile());
    }
  }));

test('republishing removes stale staged files and retains project identity', async () =>
  fixture(async (root) => {
    const destination = await stageComposition(root);
    await writeFile(resolve(destination, 'stale'), 'old source');
    await writeFile(resolve(root, '.beam/project.json'), '{"projectId":"existing"}');
    await writeFile(resolve(root, 'src/asset'), 'updated source');
    assert.equal(await stageComposition(root), destination);
    await assert.rejects(stat(resolve(destination, 'stale')), { code: 'ENOENT' });
    assert.equal(await readFile(resolve(destination, 'src/asset'), 'utf8'), 'updated source');
    assert.equal(await readFile(resolve(root, '.beam/project.json'), 'utf8'), '{"projectId":"existing"}');
  }));
