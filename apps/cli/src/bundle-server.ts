import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';

export async function serveRenderBundle(
  files: ReadonlyMap<string, string>,
  handle: (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<unknown>,
) {
  const server = createServer((request, response) => {
    void handle(request, response, () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const file = files.get(path);
      if (!file || request.method !== 'GET') {
        response.writeHead(404).end();
        return;
      }
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.wasm': 'application/wasm',
        '.webp': 'image/webp',
        '.css': 'text/css',
      };
      response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
      const stream = createReadStream(file);
      stream.on('error', (error) => response.destroy(error));
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('CLI render server did not start.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
