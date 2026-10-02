// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportRequest } from '@beam/encoder';
import { createExportServer } from './export-server';

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server ? server.close((error) => (error ? reject(error) : resolve())) : resolve(),
  );
  if (directory) await rm(directory, { recursive: true, force: true });
  server = undefined;
  directory = undefined;
});
async function backend() {
  directory = await mkdtemp(join(tmpdir(), 'beam-cli-server-'));
  const file = join(directory, 'source.webm');
  await writeFile(file, new Uint8Array([1, 2, 3, 4]));
  const output = {
    write: vi.fn(async () => {}),
    finalize: vi.fn(async () => ({ path: 'owned' })),
    abort: vi.fn(async () => {}),
  };
  const completed = vi.fn(),
    failed = vi.fn();
  const files = new Map([
    ['media', file],
    ['directory', directory],
  ]);
  const handle = createExportServer(
    'secret',
    { projectName: 'owned job' } as ExportRequest,
    files,
    output,
    completed,
    failed,
  );
  server = createServer((request, response) => {
    void handle(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  const url = (name: string) => `http://127.0.0.1:${address.port}/beam-cli/${name}?auth=secret`;
  return { url, output, completed, failed, files };
}
describe('CLI transport capabilities', () => {
  it('authenticates the job and exposes no generic filesystem endpoint', async () => {
    const { url } = await backend();
    expect((await fetch(url('job').replace('auth=secret', 'auth=wrong'))).status).toBe(403);
    expect(await (await fetch(url('job'))).json()).toMatchObject({
      request: { projectName: 'owned job' },
    });
    expect((await fetch(url('asset/unknown'))).status).toBe(400);
    expect((await fetch(url('unknown'), { method: 'POST' })).status).toBe(400);
    expect((await fetch(url('unknown'))).status).toBe(400);
  });
  it('serves real media byte ranges and clamps requests at EOF', async () => {
    const { url } = await backend();
    const response = await fetch(url('asset/media'), {
      headers: { Range: 'bytes=1-100' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1-3/4');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4]);
    expect((await fetch(url('asset/media'), { headers: { Range: 'bytes=4-' } })).status).toBe(416);
    expect([...new Uint8Array(await (await fetch(url('asset/media'))).arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });
  it('acknowledges actual positioned writes, finalization and abort', async () => {
    const { url, output } = await backend();
    const response = await fetch(url('chunk'), {
      method: 'POST',
      body: new Uint8Array([8]),
      headers: { 'x-beam-position': '4' },
    });
    expect(response.status).toBe(200);
    expect(output.write).toHaveBeenCalledWith(4, Buffer.from([8]));
    expect(await (await fetch(url('finalize'), { method: 'POST' })).json()).toEqual({ path: 'owned' });
    await fetch(url('abort'), { method: 'POST' });
    expect(output.abort).toHaveBeenCalledOnce();
  });
  it('settles completion and backend errors as separate terminal events', async () => {
    const { url, completed, failed } = await backend();
    await fetch(url('done'), {
      method: 'POST',
      body: JSON.stringify({ path: 'owned' }),
    });
    expect(completed).toHaveBeenCalledWith({ path: 'owned' });
    await fetch(url('error'), {
      method: 'POST',
      body: JSON.stringify({ error: 'failed codec' }),
    });
    expect(failed.mock.calls[0]?.[0].message).toBe('failed codec');
  });
  it('returns an explicit error when output writes or terminal JSON fail', async () => {
    const { url, output } = await backend();
    output.write.mockRejectedValueOnce(new Error('disk full'));
    expect((await fetch(url('chunk'), { method: 'POST', body: new Uint8Array([1]) })).status).toBe(400);
    expect((await fetch(url('done'), { method: 'POST', body: 'invalid json' })).status).toBe(400);
  });
  it('bounds error payloads and reports malformed backend failures', async () => {
    const { url, failed } = await backend();
    expect((await fetch(url('error'), { method: 'POST', body: 'x'.repeat(8193) })).status).toBe(400);
    await fetch(url('error'), { method: 'POST', body: '{}' });
    expect(failed.mock.calls[0]?.[0].message).toBe('Export backend failed.');
    expect((await fetch(url('../unrelated'))).status).toBe(404);
  });
  it('serves unknown media types and closes failed asset streams', async () => {
    const { url, files } = await backend();
    const file = join(directory!, 'source.bin');
    await writeFile(file, new Uint8Array([1]));
    files.set('binary', file);
    expect((await fetch(url('asset/binary'))).headers.get('Content-Type')).toBe('application/octet-stream');
    await expect(fetch(url('asset/directory'))).rejects.toThrow();
  });
});
