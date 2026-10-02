import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CliRenderJob } from './render-job-types';
import type { createBinaryOutput } from '@beam/storage/node/binary-output';

const body = async (request: IncomingMessage, maximum: number) => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const data = Buffer.from(chunk as Uint8Array);
    bytes += data.length;
    if (bytes > maximum) throw new RangeError('CLI request exceeded the byte limit.');
    chunks.push(data);
  }
  return Buffer.concat(chunks);
};

export function createExportServer(
  auth: string,
  job: CliRenderJob,
  files: Map<string, string>,
  output: Awaited<ReturnType<typeof createBinaryOutput>>,
  completed: (result: unknown) => void,
  failed: (error: Error) => void,
) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/beam-cli/')) return next();
    const json = (value: unknown) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(value));
    };
    if (url.searchParams.get('auth') !== auth) {
      response.statusCode = 403;
      return json({ error: 'Unauthorized CLI job.' });
    }
    try {
      if (url.pathname.startsWith('/beam-cli/asset/') && request.method === 'GET') {
        const file = files.get(url.pathname.slice('/beam-cli/asset/'.length));
        if (!file) throw new Error('Unknown export asset.');
        const { size } = await stat(file);
        const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start < 0 || end < start || end >= size) {
          response.statusCode = 416;
          return response.end();
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
        return;
      }
      if (url.pathname === '/beam-cli/job' && request.method === 'GET')
        return json({ request: job, platform: process.platform });
      if (request.method !== 'POST') throw new Error('Invalid CLI operation.');
      if (url.pathname === '/beam-cli/chunk') {
        const position = Number(request.headers['x-beam-position']);
        await output.write(position, await body(request, 16 * 1024 * 1024));
        return json({ written: true });
      }
      if (url.pathname === '/beam-cli/finalize') return json(await output.finalize());
      if (url.pathname === '/beam-cli/abort') {
        await output.abort();
        return json({ aborted: true });
      }
      if (url.pathname === '/beam-cli/done') {
        const result: unknown = JSON.parse((await body(request, 1024 * 1024)).toString());
        json({ received: true });
        completed(result);
        return;
      }
      if (url.pathname === '/beam-cli/error') {
        const result = JSON.parse((await body(request, 8192)).toString()) as {
          error?: unknown;
        };
        json({ received: true });
        failed(new Error(typeof result.error === 'string' ? result.error : 'Export backend failed.'));
        return;
      }
      throw new Error('Unknown CLI operation.');
    } catch (error) {
      response.statusCode = 400;
      json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}
