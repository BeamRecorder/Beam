// @vitest-environment node
import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveRenderBundle } from './bundle-server';
it('serves only the compiled allowlist and delegates authenticated operations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'beam-bundle-'));
  const file = join(directory, 'host.js');
  await writeFile(file, 'export const ready = true;');
  const server = await serveRenderBundle(
    new Map([
      ['/host.js', file],
      ['/missing.bin', join(directory, 'absent')],
    ]),
    async (request, response, next) => {
      if (request.url === '/job') response.end('owned job');
      else next();
    },
  );
  try {
    const response = await fetch(server.origin + '/host.js');
    expect(response.headers.get('Content-Type')).toBe('text/javascript');
    expect(await response.text()).toContain('ready');
    expect((await fetch(server.origin + '/src/secret.ts')).status).toBe(404);
    expect((await fetch(server.origin + '/host.js', { method: 'POST' })).status).toBe(404);
    expect(await (await fetch(server.origin + '/job')).text()).toBe('owned job');
    await expect(fetch(server.origin + '/missing.bin')).rejects.toThrow();
  } finally {
    await server.close();
    await rm(directory, { recursive: true });
  }
});
