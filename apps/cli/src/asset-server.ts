import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function serveRegisteredAsset(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  files: ReadonlyMap<string, string>,
): Promise<boolean> {
  if (!url.pathname.startsWith('/beam-cli/asset/') || request.method !== 'GET') return false;
  const file = files.get(url.pathname.slice('/beam-cli/asset/'.length));
  if (!file) throw new Error('Unknown export asset.');
  const { size } = await stat(file);
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start < 0 || end < start || end >= size) {
    response.statusCode = 416;
    response.end();
    return true;
  }
  const mediaTypes: Record<string, string> = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
  };
  response.setHeader('Content-Type', mediaTypes[extname(file).toLowerCase()] ?? 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Length', end - start + 1);
  if (range) {
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  const stream = createReadStream(file, { start, end });
  response.on('close', () => stream.destroy());
  stream.on('error', (error) => response.destroy(error));
  stream.pipe(response);
  return true;
}
