// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createRenderDocument } from '@beam/engine';
import type { ExportRequest } from '@beam/encoder';
import type { IncomingMessage, ServerResponse } from 'node:http';
const mocks = vi.hoisted(() => ({ paths: vi.fn(), bundle: vi.fn(), server: vi.fn(), run: vi.fn(), close: vi.fn() }));
vi.mock('./ffmpeg-host-paths', () => ({ ffmpegHostPaths: mocks.paths }));
vi.mock('./render-bundle', () => ({ buildRenderBundle: mocks.bundle }));
vi.mock('./bundle-server', () => ({ serveRenderBundle: mocks.server }));
vi.mock('./export-process', () => ({ runExportProcess: mocks.run }));
import { exportWithFfmpeg } from './ffmpeg-export';
let directory: string;
const request = (): ExportRequest => ({
  projectName: 'test',
  format: 'mp4',
  preset: 'medium',
  includeAudio: false,
  snapshot: createRenderDocument(undefined, 64, 64),
});
const confirmed = (config: { request: ExportRequest }) => ({
  videoEncoderImplementation: 'ffmpeg-vaapi',
  encodedPacketCount: Math.ceil(config.request.snapshot.duration * config.request.snapshot.render.fps),
});
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'beam-ffmpeg-cli-unit-'));
  await mkdir(join(directory, 'native'));
  await writeFile(join(directory, 'native/beam-ffmpeg-export'), '', { mode: 0o755 });
  await writeFile(join(directory, 'native/beam-gpu-transport.node'), '');
  mocks.paths.mockReset().mockReturnValue({
    executable: process.execPath,
    host: 'host.cjs',
    preload: 'preload.cjs',
    nativeDirectory: join(directory, 'native'),
  });
  mocks.bundle.mockReset().mockResolvedValue(new Map());
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.server.mockReset().mockResolvedValue({ origin: 'http://127.0.0.1:8765', close: mocks.close });
  mocks.run.mockReset().mockImplementation(async (_executable, args: string[]) => {
    const config = JSON.parse(await readFile(args.at(-1)!, 'utf8'));
    await writeFile(config.temporaryPath, 'complete GPU output');
    await writeFile(config.resultPath, JSON.stringify(confirmed(config)));
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const configFile = () => (mocks.run.mock.calls[0]![1] as string[]).at(-1)!;
it('publishes only completed native output and releases every owned file', async () => {
  const result = await exportWithFfmpeg(request(), directory, join(directory, 'result.mp4'), false);
  expect(result).toMatchObject({
    path: join(directory, 'result.mp4'),
    format: 'mp4',
    diagnostics: { schemaVersion: 1, environment: null, runtime: { videoEncoderImplementation: 'ffmpeg-vaapi' } },
  });
  expect(await readFile(result.path, 'utf8')).toBe('complete GPU output');
  expect(Date.parse(result.diagnostics.completedAt!)).toBeGreaterThanOrEqual(Date.parse(result.diagnostics.startedAt));
  expect(await readdir(directory)).toEqual(['native', 'result.mp4']);
  expect((mocks.run.mock.calls[0]![1] as string[]).slice(0, 3)).toEqual([
    '--ozone-platform=x11',
    'host.cjs',
    '--beam-gpu-export-host',
  ]);
  await expect(readFile(configFile())).rejects.toThrow('ENOENT');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.run.mock.calls[0]![2]).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
});
it('preserves existing destinations and supports explicit atomic replacement', async () => {
  const destination = join(directory, 'result.mp4');
  await writeFile(destination, 'existing');
  await expect(exportWithFfmpeg(request(), directory, destination, false)).rejects.toThrow();
  expect(await readFile(destination, 'utf8')).toBe('existing');
  expect(await readdir(directory)).toEqual(['native', 'result.mp4']);
  await exportWithFfmpeg(request(), directory, destination, true);
  expect(await readFile(destination, 'utf8')).toBe('complete GPU output');
});
it.each([
  { name: 'wrong encoder', result: { videoEncoderImplementation: 'webcodecs', encodedPacketCount: 30 } },
  { name: 'missing frames', result: { videoEncoderImplementation: 'ffmpeg-vaapi', encodedPacketCount: 0 } },
])('rejects an unconfirmed result ($name)', async ({ result }) => {
  mocks.run.mockImplementation(async (_executable, args: string[]) => {
    const config = JSON.parse(await readFile(args.at(-1)!, 'utf8'));
    await writeFile(config.resultPath, JSON.stringify(result));
  });
  await expect(exportWithFfmpeg(request(), directory, join(directory, 'result.mp4'), false)).rejects.toThrow(
    'complete FFmpeg export',
  );
  expect(await readdir(directory)).toEqual(['native']);
  expect(mocks.close).toHaveBeenCalledOnce();
});
it('cleans up failed/cancelled hosts without leaving partial output', async () => {
  mocks.run.mockRejectedValue(new Error('interrupted'));
  await expect(exportWithFfmpeg(request(), directory, join(directory, 'result.mp4'), false)).rejects.toThrow(
    'interrupted',
  );
  await expect(readFile(configFile())).rejects.toThrow('ENOENT');
  expect(await readdir(directory)).toEqual(['native']);
  expect(mocks.close).toHaveBeenCalledOnce();
});
it('cleans up preparation failures and missing destination directories', async () => {
  mocks.bundle.mockRejectedValueOnce(new Error('build failed'));
  await expect(exportWithFfmpeg(request(), directory, join(directory, 'out.mp4'), false)).rejects.toThrow(
    'build failed',
  );
  expect(await readdir(directory)).toEqual(['native']);
  await expect(exportWithFfmpeg(request(), directory, join(directory, 'missing/out.mp4'), false)).rejects.toThrow(
    'ENOENT',
  );
  expect(mocks.run).not.toHaveBeenCalled();
});
it('rejects missing native dependencies before staging any output', async () => {
  await rm(join(directory, 'native/beam-gpu-transport.node'));
  await expect(exportWithFfmpeg(request(), directory, join(directory, 'out.mp4'), false)).rejects.toThrow('ENOENT');
  expect(mocks.bundle).not.toHaveBeenCalled();
  expect(await readdir(directory)).toEqual(['native']);
});
it('isolates registered asset access from output writes and publication', async () => {
  let handler!: (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<unknown>;
  mocks.server.mockImplementation(async (_bundle, next) => {
    handler = next;
    return { origin: 'http://127.0.0.1:8765', close: mocks.close };
  });
  mocks.run.mockImplementation(async (_executable, args: string[]) => {
    const config = JSON.parse(await readFile(args.at(-1)!, 'utf8'));
    const auth = new URL(config.rendererUrl).searchParams.get('auth');
    const invoke = async (url: string, method = 'GET') => {
      const response = Object.assign(new EventEmitter(), {
        writeHead: vi.fn().mockReturnThis(),
        end: vi.fn(),
        statusCode: 200,
      });
      const next = vi.fn();
      await handler({ url, method } as IncomingMessage, response as unknown as ServerResponse, next);
      return { response, next };
    };
    expect((await invoke('/gpu-export.html')).next).toHaveBeenCalledOnce();
    expect((await invoke('/beam-cli/asset/a')).response.writeHead).toHaveBeenCalledWith(403);
    expect((await invoke(`/beam-cli/finalize?auth=${auth}`, 'POST')).response.writeHead).toHaveBeenCalledWith(404);
    expect((await invoke(`/beam-cli/asset/unknown?auth=${auth}`)).response.writeHead).toHaveBeenCalledWith(400);
    await writeFile(config.resultPath, JSON.stringify(confirmed(config)));
  });
  await exportWithFfmpeg(request(), directory, join(directory, 'result.mp4'), false);
});
