import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../test/fixtures/ffmpeg-export/request.json';
import type { ExportRequest } from '@beam/encoder/export-types';
import type { ExperimentalGpuExportApi } from '@beam/encoder/gpu-export/gpu-export-types';
const mocks = vi.hoisted(() => ({
  assets: vi.fn(),
  fonts: vi.fn(),
  images: vi.fn(),
  cursors: vi.fn(),
  video: vi.fn(),
  audio: vi.fn(),
  dispose: vi.fn(),
  imageClose: vi.fn(),
  cursorClose: vi.fn(),
  frameSource: vi.fn(),
}));
vi.mock('@beam/encoder/mediabunny/export-worker-assets', () => ({ openExportAssets: mocks.assets }));
vi.mock('@beam/encoder/mediabunny/export-worker-fonts', () => ({ loadExportFonts: mocks.fonts }));
vi.mock('@beam/encoder/mediabunny/export-images', () => ({ loadExportImages: mocks.images }));
vi.mock('@beam/encoder/mediabunny/export-cursor-images', () => ({ prepareExportCursorImages: mocks.cursors }));
vi.mock('@beam/encoder/mediabunny/export-worker-pipelines', () => ({
  renderExportVideo: mocks.video,
  renderExportAudio: mocks.audio,
}));
vi.mock('@beam/runtime/frames/http-frame-source', () => ({ createHttpFrameSource: mocks.frameSource }));
import { renderExperimentalExport } from '@beam/encoder/gpu-export/experimental-renderer';
const stats = { elapsedMs: 200, decodeMs: 10, renderMs: 20, encoderBackpressureMs: 170 };
let request: ExportRequest;
let api: ExperimentalGpuExportApi;
beforeEach(() => {
  vi.clearAllMocks();
  request = structuredClone(fixture) as unknown as ExportRequest;
  api = {
    request: vi.fn(async () => request),
    frame: vi.fn(),
    audio: vi.fn(),
    progress: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  };
  mocks.fonts.mockResolvedValue(undefined);
  mocks.assets.mockResolvedValue({ assets: new Map(), dispose: mocks.dispose });
  mocks.images.mockImplementation(async (_request, owned: Map<string, unknown>) => {
    owned.set('image', { close: mocks.imageClose });
    return new Map();
  });
  mocks.cursors.mockResolvedValue([{ id: 'cursor', bitmap: { close: mocks.cursorClose } }]);
  mocks.video.mockImplementation(async (...args) => {
    await args[7](1);
    await args[7](12);
    return stats;
  });
  mocks.audio.mockResolvedValue(null);
  vi.spyOn(performance, 'now').mockReturnValue(50);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    imageSmoothingEnabled: false,
  } as CanvasRenderingContext2D);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
describe('experimental shared renderer', () => {
  it('uses the shared render pipeline, reports diagnostics and releases all owned resources', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queueMicrotask(() => callback(0));
      return 1;
    });
    mocks.video.mockImplementationOnce(async (...args) => {
      await args[5].prepareVideo(0);
      await args[5].addVideo(0, 0.1);
      await args[7](12);
      return stats;
    });
    await renderExperimentalExport(api);
    expect(mocks.video).toHaveBeenCalledOnce();
    expect(mocks.audio).toHaveBeenCalledWith(
      request,
      expect.anything(),
      [],
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(api.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPipelineMs: 200,
        encodedFps: 60,
        inputVideoCodecs: [],
        inputAudioCodecs: [],
        presentationMs: 0,
      }),
    );
    expect(api.progress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'finalizing', completedImages: 12, audioProgress: null }),
    );
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.imageClose).toHaveBeenCalledOnce();
    expect(mocks.cursorClose).toHaveBeenCalledOnce();
    expect(document.querySelector('canvas')).toBeNull();
  });
  it('renders enabled audio and programmable frame sources and records actual source codecs', async () => {
    request.includeAudio = true;
    request.snapshot.composition.assets.push({
      id: 'audio',
      kind: 'audio',
      name: 'Audio',
      src: 'https://example.com/a.wav',
      origin: 'project',
      durationMs: 1200,
      fileName: null,
      width: null,
      height: null,
    });
    request.snapshot.composition.clips.push({
      id: 'audio',
      kind: 'audio',
      name: 'Audio',
      assetId: 'audio',
      role: 'imported',
      volume: 1,
      order: 20,
      enabled: true,
      timelineStartMs: 0,
      timelineDurationMs: 1200,
      sourceInMs: 0,
      sourceDurationMs: 1200,
      playbackRate: 1,
      transitions: { entry: null, exit: null },
    });
    request.frameSources = [{ assetId: 'html', url: 'http://localhost/frames' }];
    mocks.assets.mockResolvedValue({
      assets: new Map([
        ['audio', { audio: { getCodec: async () => 'pcm-s16' }, video: { getCodec: async () => 'avc' } }],
        ['empty', {}],
      ]),
      dispose: mocks.dispose,
    });
    mocks.audio.mockImplementation(async (...args) => {
      args[5](1, 2);
      args[5](0, 0);
      return { elapsedMs: 100, realtimeSpeed: 12 };
    });
    vi.spyOn(performance, 'now').mockReturnValue(150);
    await renderExperimentalExport(api);
    expect(mocks.audio.mock.calls[0]![2]).toHaveLength(1);
    expect(mocks.frameSource).toHaveBeenCalledWith('http://localhost/frames');
    expect(api.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        audioPipelineMs: 100,
        audioRealtimeSpeed: 12,
        inputVideoCodecs: ['avc'],
        inputAudioCodecs: ['pcm-s16'],
      }),
    );
  });
  it('rejects malformed documents before allocating resources', async () => {
    request.snapshot.duration = -1;
    await expect(renderExperimentalExport(api)).rejects.toThrow('Invalid render document');
    expect(mocks.assets).not.toHaveBeenCalled();
  });
  it.each(['images', 'cursors', 'context', 'video', 'audio'])(
    'cleans up and does not report completion after %s failure',
    async (stage) => {
      if (stage === 'context') vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      else mocks[stage as 'images' | 'cursors' | 'video' | 'audio'].mockRejectedValueOnce(new Error(`${stage} failed`));
      await expect(renderExperimentalExport(api)).rejects.toThrow();
      expect(mocks.dispose).toHaveBeenCalledOnce();
      expect(api.complete).not.toHaveBeenCalled();
      expect(document.querySelector('canvas')).toBeNull();
      if (stage === 'video' || stage === 'audio')
        expect((mocks.video.mock.calls[0]![6] as AbortSignal).aborted).toBe(true);
    },
  );
  it('surfaces asset-validation and font-load failures without starting pipelines', async () => {
    mocks.fonts.mockRejectedValueOnce(new Error('font failed'));
    await expect(renderExperimentalExport(api)).rejects.toThrow('font failed');
    mocks.assets.mockRejectedValueOnce(new Error('missing source'));
    await expect(renderExperimentalExport(api)).rejects.toThrow('missing source');
    expect(mocks.video).not.toHaveBeenCalled();
  });
});
