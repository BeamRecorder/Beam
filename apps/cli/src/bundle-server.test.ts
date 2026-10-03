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
it('serves SVG composition assets with their image MIME type', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'beam-bundle-svg-'));
  const file = join(directory, 'phone.svg');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="415" height="843"/>';
  await writeFile(file, svg);
  const server = await serveRenderBundle(new Map([['/motion/phone.svg', file]]), async (_request, _response, next) =>
    next(),
  );
  try {
    const response = await fetch(server.origin + '/motion/phone.svg');
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toBe(svg);
  } finally {
    await server.close();
    await rm(directory, { recursive: true });
  }
});
