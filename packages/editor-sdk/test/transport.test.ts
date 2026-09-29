import { createServer, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { EditorConnection } from '../src/transport.ts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0)) await dispose(); });
async function owner(handle: (socket: Socket, request: Record<string, unknown>) => void): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'beam-sdk-'));
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\beam-sdk-${randomUUID()}` : join(root, 'owner.socket');
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
    let data = ''; socket.on('data', (chunk) => { data += String(chunk); if (data.includes('\n')) handle(socket, JSON.parse(data.slice(0, data.indexOf('\n'))) as Record<string, unknown>); });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
  cleanup.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  return endpoint;
}
it('uses typed authenticated frames, handles chunking and concurrent requests', async () => {
  const endpoint = await owner((socket, request) => {
    expect(request.token).toBe('token');
    const frame = JSON.stringify({ apiVersion: 1, requestId: request.requestId, response: { type: 'acknowledged' } }) + '\n';
    socket.write(frame.slice(0, 10)); setTimeout(() => socket.end(frame.slice(10)), 2);
  });
  const connection = await EditorConnection.connect({ endpoint, token: 'token' });
  expect(await Promise.all([connection.request({ method: 'discovery' }), connection.request({ method: 'transport' })])).toEqual([{ type: 'acknowledged' }, { type: 'acknowledged' }]);
  connection.close(); connection.close();
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('disposed');
});
it('rejects malformed responses, wrong identities, versions and closed owners', async () => {
  for (const response of ['bad\n', JSON.stringify({ apiVersion: 2, requestId: 'x', response: { type: 'acknowledged' } }) + '\n', JSON.stringify({ apiVersion: 1, requestId: 'wrong', response: { type: 'acknowledged' } }) + '\n']) {
    const endpoint = await owner((socket) => socket.end(response));
    const connection = await EditorConnection.connect({ endpoint, token: 't' });
    await expect(connection.request({ method: 'discovery' })).rejects.toThrow(); connection.close();
  }
  const endpoint = await owner((socket) => socket.end());
  const connection = await EditorConnection.connect({ endpoint, token: 't' });
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('closed'); connection.close();
});
it('enforces cancellation, timeouts, message and queue budgets', async () => {
  const endpoint = await owner(() => {});
  const connection = await EditorConnection.connect({ endpoint, token: 't', timeoutMs: 5 });
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('timed out');
  const already = AbortSignal.abort();
  await expect(connection.request({ method: 'discovery' }, { signal: already })).rejects.toThrow('cancelled');
  const controller = new AbortController(); const pending = connection.request({ method: 'discovery' }, { signal: controller.signal, timeoutMs: 1000 }); controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  await expect(connection.request({ method: 'discovery' }, { timeoutMs: 0 })).rejects.toThrow('Timeout');
  await expect(connection.request({ method: 'create', projectGrant: 'g', name: 'x'.repeat(8 * 1024 * 1024) })).rejects.toThrow('message budget');
  const requests = Array.from({ length: 128 }, () => connection.request({ method: 'discovery' }, { timeoutMs: 1000 }).catch((error: unknown) => error));
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('queue budget'); connection.close();
  await Promise.all(requests);
});
it('validates requests and handles absent endpoints and oversized replies', async () => {
  await expect(EditorConnection.connect({ endpoint: '', token: 'x' })).rejects.toThrow('required');
  const missing = await EditorConnection.connect({ endpoint: '/tmp/missing-beam-owner.socket', token: 't' });
  await expect(missing.request({ method: 'discovery' })).rejects.toThrow(); missing.close();
  const endpoint = await owner((socket) => socket.end('x'.repeat(8 * 1024 * 1024 + 1)));
  const connection = await EditorConnection.connect({ endpoint, token: 't' });
  await expect(connection.request({ method: 'discovery' })).rejects.toThrow('response budget');
  await expect(connection.request({ method: 'seek', positionMs: -1 })).rejects.toThrow(); connection.close();
});
