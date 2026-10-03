import { serveRegisteredAsset } from './asset-server';
import type { GpuMonitor } from '@beam/system-metrics/node/gpu-monitor';
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
  output: Pick<Awaited<ReturnType<typeof createBinaryOutput>>, 'write' | 'finalize' | 'abort'>,
  completed: (result: unknown) => void,
  failed: (error: Error) => void,
  gpuMonitor?: () => GpuMonitor | undefined,
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
      if (await serveRegisteredAsset(url, request, response, files)) return;
      if (url.pathname === '/beam-cli/job' && request.method === 'GET')
        return json({ request: job, platform: process.platform });
      if (request.method !== 'POST') throw new Error('Invalid CLI operation.');
      if (url.pathname === '/beam-cli/chunk') {
        const position = Number(request.headers['x-beam-position']);
        await output.write(position, await body(request, 16 * 1024 * 1024));
        return json({ written: true });
      }
      if (url.pathname === '/beam-cli/finalize') {
        const gpuUsage = await gpuMonitor?.()?.finish();
        return json({ ...(await output.finalize()), ...(gpuUsage ? { gpuUsage } : {}) });
      }
      if (url.pathname === '/beam-cli/abort') {
        const gpuUsage = await gpuMonitor?.()?.finish();
        await output.abort();
        return json({ aborted: true, ...(gpuUsage ? { gpuUsage } : {}) });
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
