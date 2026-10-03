// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonOutput } from '@beam/storage/node/atomic-output';
import { createBinaryOutput } from '@beam/storage/node/binary-output';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    open: vi.fn(original.open),
    unlink: vi.fn(original.unlink),
  };
});

const directories: string[] = [];
async function destination() {
  const directory = await mkdtemp(join(tmpdir(), 'beam-output-'));
  directories.push(directory);
  return join(directory, 'output');
}
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('owned CLI outputs', () => {
  it('writes complete JSON and removes staging files', async () => {
    const path = await destination();
    await writeJsonOutput(path, { value: 1 });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ value: 1 });
    expect(await readdir(join(path, '..'))).toEqual(['output']);
  });
  it('preserves an existing JSON destination unless overwrite is explicit', async () => {
    const path = await destination();
    await writeFile(path, 'original');
    await expect(writeJsonOutput(path, {})).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await readFile(path, 'utf8')).toBe('original');
    await writeJsonOutput(path, { next: true }, true);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ next: true });
  });
  it('does not touch disk when serialization fails', async () => {
    const path = await destination();
    await expect(writeJsonOutput(path, { value: 1n })).rejects.toThrow();
    expect(await readdir(join(path, '..'))).toEqual([]);
  });
  it('supports random-access container header patches and refuses use after completion', async () => {
    const path = await destination();
    const output = await createBinaryOutput(path, false);
    await output.write(0, new Uint8Array([1, 2, 3]));
    await output.write(1, new Uint8Array([4]));
    expect(await output.finalize()).toEqual({ path });
    expect([...(await readFile(path))]).toEqual([1, 4, 3]);
    await expect(output.write(0, new Uint8Array([0]))).rejects.toThrow('closed');
    await expect(output.finalize()).rejects.toThrow('closed');
    await output.abort();
    expect(await readFile(path)).toHaveLength(3);
  });
  it('validates positions and cleans up aborted exports idempotently', async () => {
    const path = await destination();
    const output = await createBinaryOutput(path, false);
    await expect(output.write(-1, new Uint8Array([1]))).rejects.toThrow('position');
    await output.write(0, new Uint8Array([]));
    await output.abort();
    await output.abort();
    expect(await readdir(join(path, '..'))).toEqual([]);
  });
  it('preserves an existing export on publication failure and supports explicit overwrite', async () => {
    const path = await destination();
    await writeFile(path, 'original');
    const output = await createBinaryOutput(path, false);
    await output.write(0, new Uint8Array([1]));
    await expect(output.finalize()).rejects.toMatchObject({ code: 'EEXIST' });
    await output.abort();
    expect(await readFile(path, 'utf8')).toBe('original');
    const replacement = await createBinaryOutput(path, true);
    await replacement.write(0, new Uint8Array([2]));
    await replacement.finalize();
    expect([...(await readFile(path))]).toEqual([2]);
  });
  it('rejects a stalled disk write and still cleans up the owned file', async () => {
    const path = await destination();
    const handle = await open(path + '.handle', 'wx');
    const write = vi.spyOn(handle, 'write').mockResolvedValueOnce({ bytesWritten: 0, buffer: '' });
    vi.mocked(open).mockResolvedValueOnce(handle);
    const output = await createBinaryOutput(path, false);
    await expect(output.write(0, new Uint8Array([1]))).rejects.toThrow('no progress');
    expect(write).toHaveBeenCalledOnce();
    await output.abort();
  });
  it('surfaces cleanup failures for both JSON and binary output', async () => {
    const path = await destination();
    const denied = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });
    vi.mocked(unlink).mockRejectedValueOnce(denied);
    await expect(writeJsonOutput(path, {}, true)).rejects.toThrow('Permission denied');
    const output = await createBinaryOutput(path, false);
    vi.mocked(unlink).mockRejectedValueOnce(denied);
    await expect(output.abort()).rejects.toThrow('Permission denied');
    await output.abort();
  });
});
describe('direct native writes to the owned staging inode', () => {
  it('synchronizes external writes before publishing the destination', async () => {
    const path = await destination();
    const output = await createBinaryOutput(path, false);
    await writeFile(output.temporaryPath, 'native output');
    await output.finalize();
    expect(await readFile(path, 'utf8')).toBe('native output');
  });
  it('removes cancelled external writes without publishing a destination', async () => {
    const path = await destination();
    const output = await createBinaryOutput(path, false);
    await writeFile(output.temporaryPath, 'partial native output');
    await output.abort();
    await expect(readFile(path)).rejects.toThrow('ENOENT');
    await expect(readFile(output.temporaryPath)).rejects.toThrow('ENOENT');
  });
  it('preserves an existing destination when the external writer is not authorized to overwrite', async () => {
    const path = await destination();
    await writeFile(path, 'existing');
    const output = await createBinaryOutput(path, false);
    await writeFile(output.temporaryPath, 'replacement');
    await expect(output.finalize()).rejects.toThrow();
    await output.abort();
    expect(await readFile(path, 'utf8')).toBe('existing');
  });
});
