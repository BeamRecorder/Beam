import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureApi } from '~/api/types/capture-api';
import type { ExportRequest, ExportProgress } from '@beam/encoder/export-types';
import { exportWithLinuxFfmpeg } from '../experimental-exporter';
vi.mock('../export-environment', () => ({
  collectExportEnvironment: vi.fn().mockResolvedValue({ platform: 'linux' }),
}));
const request = {
  projectName: 'GPU',
  format: 'mp4',
  preset: 'medium',
  snapshot: { canvas: { width: 640, height: 360 }, render: { fps: 30 } },
} as ExportRequest;
const runtime = { elapsedMs: 100, videoCodec: 'avc' };
const mock = () => ({
  platform: 'linux',
  beginExport: vi.fn().mockResolvedValue({ canceled: false, jobId: 'job' }),
  renderLinuxFfmpegExport: vi.fn().mockResolvedValue(runtime),
  finalizeExport: vi.fn().mockResolvedValue({ path: '/output.mp4' }),
  abortExport: vi.fn().mockResolvedValue({}),
  unsubscribe: vi.fn(),
  onFfmpegExportProgress: vi.fn(),
});
let api: ReturnType<typeof mock>;
let listener: (event: { jobId: string; progress: ExportProgress }) => void;
beforeEach(() => {
  api = mock();
  api.onFfmpegExportProgress.mockImplementation((callback) => {
    listener = callback;
    return api.unsubscribe;
  });
  Object.defineProperty(window, 'capture', { configurable: true, value: api });
});
afterEach(() => vi.restoreAllMocks());
describe('Linux native export desktop adapter', () => {
  it('starts diagnostics, forwards only owned progress and atomically finalizes', async () => {
    const onProgress = vi.fn(),
      onStarted = vi.fn();
    api.renderLinuxFfmpegExport.mockImplementation(async () => {
      listener({ jobId: 'foreign', progress: {} as ExportProgress });
      listener({ jobId: 'job', progress: { stage: 'encoding' } as ExportProgress });
      return runtime;
    });
    const result = await exportWithLinuxFfmpeg(request, onProgress, new AbortController().signal, onStarted);
    expect(result.path).toBe('/output.mp4');
    expect(result.diagnostics.completedAt).not.toBeNull();
    expect(onStarted).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledOnce();
    expect(api.unsubscribe).toHaveBeenCalledOnce();
    expect(api.renderLinuxFfmpegExport).toHaveBeenCalledWith('job', request, expect.any(Number));
    expect(api.finalizeExport).toHaveBeenCalledWith('job');
  });
  it('rejects missing APIs, non-Linux hosts and already cancelled work before opening a file', async () => {
    Object.defineProperty(window, 'capture', { configurable: true, value: undefined });
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), new AbortController().signal)).rejects.toThrow('Linux-only');
    api.platform = 'darwin';
    Object.defineProperty(window, 'capture', { configurable: true, value: api as unknown as CaptureApi });
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), new AbortController().signal)).rejects.toThrow('Linux-only');
    api.platform = 'linux';
    const controller = new AbortController();
    controller.abort();
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(api.beginExport).not.toHaveBeenCalled();
  });
  it('handles cancelled destinations and cancellation during the destination dialog', async () => {
    api.beginExport.mockResolvedValueOnce({ canceled: true } as never);
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), new AbortController().signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    const controller = new AbortController();
    api.beginExport.mockImplementationOnce(async () => {
      controller.abort();
      return { canceled: false, jobId: 'job' };
    });
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(api.abortExport).toHaveBeenCalledWith('job');
    expect(api.renderLinuxFfmpegExport).not.toHaveBeenCalled();
  });
  it('aborts on native/finalization failure and tolerates cleanup rejection', async () => {
    api.renderLinuxFfmpegExport.mockRejectedValueOnce(new Error('direct map failed'));
    api.abortExport.mockRejectedValueOnce(new Error('already removed'));
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), new AbortController().signal)).rejects.toThrow(
      'direct map failed',
    );
    expect(api.unsubscribe).toHaveBeenCalledOnce();
    api.finalizeExport.mockRejectedValueOnce(new Error('rename failed'));
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), new AbortController().signal)).rejects.toThrow(
      'rename failed',
    );
  });
  it('cancels the native process during encoding and does not publish its partial file', async () => {
    const controller = new AbortController();
    api.renderLinuxFfmpegExport.mockImplementationOnce(async () => {
      controller.abort();
      return runtime;
    });
    api.abortExport.mockRejectedValue(new Error('job removed'));
    await expect(exportWithLinuxFfmpeg(request, vi.fn(), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(api.finalizeExport).not.toHaveBeenCalled();
    expect(api.abortExport).toHaveBeenCalled();
    expect(api.unsubscribe).toHaveBeenCalledOnce();
  });
});
