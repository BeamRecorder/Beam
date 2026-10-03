// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createRenderDocument, createStillDocument } from '@beam/engine';
import { exportWithBackend, parseExportOptions } from './export-backends';
import type { ExportRequest } from '@beam/encoder';
afterEach(() => vi.restoreAllMocks());
const request = (): ExportRequest => ({
  projectName: 'owned',
  format: 'mp4',
  preset: 'medium',
  snapshot: createRenderDocument(),
});

it('defaults to WebCodecs with overwrite disabled', () => {
  expect(parseExportOptions([])).toEqual({ backend: 'webcodecs', overwrite: false });
  expect(parseExportOptions(['--overwrite'])).toEqual({ backend: 'webcodecs', overwrite: true });
});
it.each(['webcodecs', 'ffmpeg-vaapi'])('accepts %s in either option order', (backend) => {
  expect(parseExportOptions(['--backend', backend, '--overwrite'])).toEqual({ backend, overwrite: true });
  expect(parseExportOptions(['--overwrite', '--backend', backend])).toEqual({ backend, overwrite: true });
});
it.each(
  [
    ['--backend'],
    ['--backend', 'unknown'],
    ['--backend', '--overwrite'],
    ['--extra'],
    ['--overwrite', '--overwrite'],
    ['--backend', 'ffmpeg-vaapi', '--backend', 'webcodecs'],
  ].map((flags) => ({ flags })),
)('rejects invalid/repeated flags (%j)', ({ flags }) => {
  expect(() => parseExportOptions(flags)).toThrow(/backend|option/);
});
it('dispatches the original request to the Chromium host without selecting native encoding', async () => {
  const browser = await import('./chromium-export');
  const render = vi.spyOn(browser, 'exportInChromium').mockResolvedValue({ path: 'result' });
  const native = await import('./ffmpeg-export');
  const gpu = vi.spyOn(native, 'exportWithFfmpeg');
  const input = request();
  expect(await exportWithBackend(input, 'source', 'output', { backend: 'webcodecs', overwrite: false })).toEqual({
    path: 'result',
  });
  expect(render).toHaveBeenCalledWith(input, 'source', 'output', false);
  expect(gpu).not.toHaveBeenCalled();
});
it('dispatches an explicitly selected FFmpeg job to the native host', async () => {
  const native = await import('./ffmpeg-export');
  const render = vi
    .spyOn(native, 'exportWithFfmpeg')
    .mockResolvedValue({ path: 'result', format: 'mp4', diagnostics: {} as never });
  const input = request();
  await exportWithBackend(input, 'source', 'output', { backend: 'ffmpeg-vaapi', overwrite: true });
  expect(render).toHaveBeenCalledWith(input, 'source', 'output', true);
});
it('rejects still/frame jobs on the experimental video-only backend', async () => {
  const native = await import('./ffmpeg-export');
  const render = vi.spyOn(native, 'exportWithFfmpeg');
  const options = { backend: 'ffmpeg-vaapi' as const, overwrite: false };
  await expect(
    exportWithBackend({ kind: 'image', document: createStillDocument('id', 'image.png', 64, 64) }, '.', 'out', options),
  ).rejects.toThrow('video exports only');
  await expect(
    exportWithBackend({ kind: 'frame', request: request(), timeMs: 0 }, '.', 'out', options),
  ).rejects.toThrow('video exports only');
  expect(render).not.toHaveBeenCalled();
});
