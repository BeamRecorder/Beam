// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCommand } from './cli-runner';
import { createDocumentHost } from './document-host';
import type { StillDocument } from '@beam/engine';
import { colorClip } from '../../../packages/engine/src/scene/tests/scene-fixtures';
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
it('assigns independent document identities to extracted frames and validates capture boundaries before rendering', async () => {
  const root = await fixture(),
    input = join(root, 'video.json');
  await runCliCommand(['create', 'video', input]);
  const backend = await import('./chromium-export');
  const render = vi.spyOn(backend, 'exportInChromium').mockResolvedValue({ format: 'png', timeMs: 0 });
  const first = (await runCliCommand(['frame', input, '0', join(root, 'first.png')])) as { document: StillDocument };
  const second = (await runCliCommand(['frame', input, '0', join(root, 'second.png')])) as { document: StillDocument };
  expect(first.document.kind).toBe('image');
  expect(second.document.id).not.toBe(first.document.id);
  expect(first.document.source).toBe(join(root, 'first.png'));
  for (const time of ['-1', 'NaN', '1000'])
    await expect(runCliCommand(['frame', input, time, join(root, 'bad.png')])).rejects.toThrow('Frame time');
  expect(render).toHaveBeenCalledTimes(2);
  await expect(runCliCommand(['frame', input])).rejects.toThrow('beam frame');
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'beam-authoring-'));
  directories.push(root);
  return root;
}
it('creates a video, adds a clip through engine commands and retains presentation metadata on edit', async () => {
  const root = await fixture(),
    input = join(root, 'video.json'),
    commands = join(root, 'commands.json'),
    output = join(root, 'edited.json');
  await runCliCommand(['create', 'video', input]);
  await writeFile(
    commands,
    JSON.stringify([
      { type: 'clip.add', payload: colorClip() },
      { type: 'render.patch', payload: { blurPercent: 10 } },
    ]),
  );
  expect(await runCliCommand(['edit', input, commands, output])).toMatchObject({ revision: 1, commandsApplied: 2 });
  const result = JSON.parse(await readFile(output, 'utf8'));
  expect(result.snapshot.blurPercent).toBe(10);
  expect(result.snapshot.composition.clips).toHaveLength(1);
  expect(result.documentId).toBeTypeOf('string');
  expect(await runCliCommand(['commands'])).toMatchObject({ video: expect.arrayContaining(['render.patch']) });
});
it('constructs editable images and uses identified shared transactions outside CLI argument parsing', async () => {
  const root = await fixture(),
    file = join(root, 'image.json');
  await runCliCommand(['create', 'image', 'source.png', '64', '64', file]);
  const value = JSON.parse(await readFile(file, 'utf8')),
    host = createDocumentHost(value);
  const input = {
    version: 1,
    id: 'request',
    method: 'transaction',
    transaction: {
      version: 1,
      documentId: value.id,
      operationId: 'op',
      actorId: 'editor',
      expectedRevision: 0,
      commands: [{ type: 'still.layer.patch', payload: { layerId: 'image', patch: { isMirrored: true } } }],
    },
  };
  expect(await host.endpoint.receive(input)).toMatchObject({ ok: true, result: { revision: 1 } });
  expect(await host.endpoint.receive(input)).toMatchObject({ ok: true, result: { revision: 1 } });
  expect((host.document as StillDocument).state.image.isMirrored).toBe(true);
});
it('rejects malformed inputs and protects destinations without overwrite', async () => {
  const root = await fixture(),
    file = join(root, 'video.json');
  await runCliCommand(['create', 'video', file]);
  await expect(runCliCommand(['create', 'video', file])).rejects.toThrow();
  await expect(runCliCommand(['create', 'image', 'source', '-1', '64', join(root, 'bad.json')])).rejects.toThrow();
  const commands = join(root, 'bad-commands.json');
  await writeFile(commands, '[{"payload":0}]');
  await expect(runCliCommand(['edit', file, commands, join(root, 'edited.json')])).rejects.toThrow('Expected');
  expect(await runCliCommand(['--help'])).toMatchObject({ usage: expect.stringContaining('beam serve') });
});
it('routes an agent export to the selected backend with validated settings and portable paths', async () => {
  const root = await fixture(),
    input = join(root, 'video.json'),
    output = join(root, 'result.mp4');
  await runCliCommand(['create', 'video', input]);
  const backend = await import('./export-backends');
  const render = vi.spyOn(backend, 'exportWithBackend').mockResolvedValue({ path: output });
  expect(await runCliCommand(['export', input, output, '--overwrite', '--backend', 'ffmpeg-vaapi'])).toEqual({
    path: output,
  });
  expect(render).toHaveBeenCalledWith(
    expect.objectContaining({ format: 'mp4', snapshot: expect.any(Object) }),
    root,
    output,
    { backend: 'ffmpeg-vaapi', overwrite: true },
  );
  await expect(runCliCommand(['export', input, output, '--backend', 'unknown'])).rejects.toThrow('backend');
  expect(render).toHaveBeenCalledTimes(1);
  expect(await runCliCommand(['--help'])).toMatchObject({
    usage: expect.stringContaining('--backend webcodecs|ffmpeg-vaapi'),
  });
});
