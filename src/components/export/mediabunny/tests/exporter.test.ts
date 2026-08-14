import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OUTPUT_CANVAS } from '../../../video-editor/canvas/output-canvas';
import type { ClipComposition, MediaAsset } from '~/media/shared/composition-types';
import type { ExportRequest } from '../../export-types';
import { exportWithMediabunny, renderMixedAudio, supportedAudioCodec, supportedVideoCodec } from '../exporter';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const { videoCodec, audioCodec, renderedAudio } = vi.hoisted(() => ({
  videoCodec: vi.fn(),
  audioCodec: vi.fn(),
  renderedAudio: { duration: 3 } as AudioBuffer,
}));
const exportRuntime = vi.hoisted(() => ({
  outputs: [] as Array<{
    start: ReturnType<typeof vi.fn>;
    addVideoFrame: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }>,
  renderFrame: vi.fn(),
  createProvider: vi.fn(),
  mixAudio: vi.fn(),
  outputOptions: [] as unknown[][],
  inspectMedia: vi.fn(),
  prepareExport: vi.fn(),
  cameraEvaluator: { sample: vi.fn(() => ({ scale: 1, focus: { cx: 0.5, cy: 0.5 } })), invalidate: vi.fn() },
}));

vi.mock('~/media/export', () => ({
  findExportAudioCodec: audioCodec,
  findExportVideoCodec: videoCodec,
  mixCompositionAudio: exportRuntime.mixAudio,
  VideoFrameProvider: { create: exportRuntime.createProvider },
  StreamingMediaOutput: class StreamingMediaOutput {
    readonly start = vi.fn(async () => undefined);
    readonly addVideoFrame = vi.fn(async () => undefined);
    readonly finalize = vi.fn(async () => undefined);
    readonly cancel = vi.fn(async () => undefined);

    constructor(...args: unknown[]) {
      exportRuntime.outputOptions.push(args);
      exportRuntime.outputs.push(this);
    }
  },
}));

vi.mock('~/media/shared', async () => ({
  ...(await vi.importActual('~/media/shared')),
  inspectMedia: exportRuntime.inspectMedia,
}));

vi.mock('../../composition/render', () => ({
  renderCompositionFrame: exportRuntime.renderFrame,
  createSnapshotCameraEvaluator: vi.fn(() => exportRuntime.cameraEvaluator),
}));
vi.mock('../export-preflight', () => ({ prepareExport: exportRuntime.prepareExport }));
vi.mock('../../../video-editor/properties/cursor/useCursorReplacer', () => ({
  cursorTypeForKind: vi.fn(() => 'default'),
  useCursorReplacer: () => ({ getCursorImage: vi.fn(async () => ({ width: 24, height: 24 })) }),
}));

const screenAsset = (): MediaAsset => ({
  id: 'screen-asset',
  kind: 'video',
  name: 'Session',
  fileName: 'session.mp4',
  durationMs: 2_000,
  width: 1_920,
  height: 1_080,
  src: 'project-media://asset/session.mp4',
  origin: 'session',
});

const audioAsset = (): MediaAsset => ({
  id: 'audio-asset',
  kind: 'audio',
  name: 'Music',
  fileName: 'music.wav',
  durationMs: 3_000,
  width: null,
  height: null,
  src: 'project-media://asset/music.wav',
  origin: 'project',
});

const importedVideoAsset = (): MediaAsset => ({
  id: 'imported-video-asset',
  kind: 'video',
  name: 'Imported video',
  fileName: 'imported.webm',
  durationMs: 2_000,
  width: 1_280,
  height: 720,
  src: 'project-media://asset/imported.webm',
  origin: 'project',
});

const composition = (
  options: { screen?: boolean; importedVideo?: boolean; audio?: boolean; audioEnabled?: boolean } = {},
): ClipComposition => {
  const assets: MediaAsset[] = options.screen === false ? [] : [screenAsset()];
  const clips: ClipComposition['clips'] =
    options.screen === false
      ? []
      : [
          {
            id: 'screen',
            kind: 'screen',
            name: 'Session',
            assetId: 'screen-asset',
            timelineStartMs: 0,
            timelineDurationMs: 2_000,
            sourceInMs: 0,
            sourceDurationMs: 2_000,
            playbackRate: 1,
            enabled: true,
            order: 0,
            transform: { x: 0, y: 0, width: 1, height: 1 },
            appearance: createDefaultClipAppearance('screen'),
            isMirrored: false,
            isMirroredY: false,
          },
        ];
  if (options.importedVideo) {
    assets.push(importedVideoAsset());
    clips.push({
      id: 'imported-video',
      kind: 'video',
      name: 'Imported video',
      assetId: 'imported-video-asset',
      timelineStartMs: 0,
      timelineDurationMs: 2_000,
      sourceInMs: 0,
      sourceDurationMs: 2_000,
      playbackRate: 1,
      enabled: true,
      order: clips.length,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('video'),
      isMirrored: false,
      isMirroredY: false,
    });
  }
  if (options.audio) {
    assets.push(audioAsset());
    clips.push({
      id: 'audio',
      kind: 'audio',
      name: 'Music',
      assetId: 'audio-asset',
      role: 'imported',
      timelineStartMs: 200,
      timelineDurationMs: 1_500,
      sourceInMs: 100,
      sourceDurationMs: 1_500,
      playbackRate: 1.25,
      enabled: options.audioEnabled !== false,
      order: clips.length,
      volume: 150,
    });
  }
  return { schemaVersion: 2, assets, clips } as ClipComposition;
};

const request = (
  options: { screen?: boolean; importedVideo?: boolean; audio?: boolean; audioEnabled?: boolean } = {},
): ExportRequest => ({
  projectName: 'Demo',
  format: 'webm',
  preset: 'medium',
  snapshot: {
    duration: 2,
    render: { fps: 30, sourceWidth: 1_920, sourceHeight: 1_080 },
    canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1_920, height: 1_080 },
    background: null,
    blurPercent: 0,
    zooms: [],
    cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    cursorSettings: {
      selectedCursor: 'automatic',
      size: 24,
      color: '#fff',
      shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
      clickEffects: {
        left: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#f00' },
        right: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#00f' },
      },
      motion: { preset: 'smooth' as const, smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
    },
    composition: composition(options),
  },
});

const setCapture = (value: Record<string, unknown>) => {
  Object.defineProperty(window, 'capture', { configurable: true, value });
};

beforeEach(() => {
  vi.clearAllMocks();
  exportRuntime.outputs = [];
  exportRuntime.outputOptions = [];
  exportRuntime.inspectMedia.mockResolvedValue({ metadata: { durationSeconds: 2 } });
  exportRuntime.mixAudio.mockImplementation(async (value: ClipComposition) =>
    value.clips.some((clip) => clip.kind === 'audio' && clip.enabled) ? renderedAudio : null,
  );
  exportRuntime.prepareExport.mockImplementation(async (value: ExportRequest) => ({
    fps: value.snapshot.render.fps,
    activeClipIds: new Set(
      value.snapshot.composition.clips
        .filter((clip) => clip.enabled && clip.timelineDurationMs > 0)
        .map((clip) => clip.id),
    ),
    images: new Map(),
    backgroundImage:
      value.snapshot.background?.kind === 'image' ? { source: {} as CanvasImageSource, width: 320, height: 180 } : null,
    backgroundVideoDuration: value.snapshot.background?.kind === 'video' ? 2 : null,
    mixedAudio: await exportRuntime.mixAudio(value.snapshot.composition, value.snapshot.duration),
    screenSize: value.snapshot.composition.clips.some((clip) => clip.kind === 'screen' && clip.enabled)
      ? { width: 1_920, height: 1_080 }
      : null,
    dispose: vi.fn(),
  }));
  videoCodec.mockReturnValue('vp9');
  audioCodec.mockReturnValue('opus');
  exportRuntime.createProvider.mockResolvedValue({
    frameAt: vi.fn(async () => ({
      bitmap: { width: 1_920, height: 1_080 },
      width: 1_920,
      height: 1_080,
      close: vi.fn(),
    })),
    dispose: vi.fn(),
  });
});

afterEach(() => {
  delete (window as Window & { capture?: unknown }).capture;
  vi.restoreAllMocks();
});

describe('mediabunny exporter', () => {
  it('selects the format-specific video codec and bitrate', () => {
    const value = request();
    expect(supportedVideoCodec(value)).toBe('vp9');
    expect(videoCodec).toHaveBeenCalledWith(
      'webm',
      expect.objectContaining({ width: 1_920, height: 1_080, bitrate: expect.any(Number) }),
    );

    value.format = 'mp4';
    supportedVideoCodec(value);
    expect(videoCodec).toHaveBeenLastCalledWith('mp4', expect.objectContaining({ width: 1_920, height: 1_080 }));
  });

  it('only probes audio codecs when an enabled audio clip exists', async () => {
    expect(await supportedAudioCodec(request())).toBeNull();
    expect(audioCodec).not.toHaveBeenCalled();

    const value = request({ audio: true });
    expect(await supportedAudioCodec(value)).toBe('opus');
    expect(audioCodec).toHaveBeenCalledWith('webm', { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });

    value.format = 'mp4';
    await supportedAudioCodec(value);
    expect(audioCodec).toHaveBeenLastCalledWith('mp4', expect.any(Object));
  });

  it('mixes enabled audio clips with clamped gain and source offsets', async () => {
    const result = await renderMixedAudio(request({ audio: true }));

    expect(result).toBe(renderedAudio);
    expect(exportRuntime.mixAudio).toHaveBeenCalledWith(expect.anything(), 2);
  });

  it('handles empty, unavailable, missing, and unreadable audio sources', async () => {
    expect(await renderMixedAudio(request())).toBeNull();
    exportRuntime.mixAudio.mockRejectedValueOnce(new Error('Offline audio mixing is unavailable.'));
    await expect(renderMixedAudio(request({ audio: true }))).rejects.toThrow('Offline audio mixing');

    const missing = request({ audio: true });
    missing.snapshot.composition.assets = [];
    exportRuntime.mixAudio.mockRejectedValueOnce(new Error('audio sidecar is missing'));
    await expect(renderMixedAudio(missing)).rejects.toThrow('audio sidecar');

    exportRuntime.mixAudio.mockRejectedValueOnce(new Error('audio sidecar is unreadable'));
    await expect(renderMixedAudio(request({ audio: true }))).rejects.toThrow('audio sidecar');
  });

  it('rejects unsupported codecs before opening native export', async () => {
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    videoCodec.mockReturnValueOnce(null);
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toThrow('not encodable');

    audioCodec.mockReturnValueOnce(null);
    await expect(exportWithMediabunny(request({ audio: true }), onProgress, signal)).rejects.toThrow(
      'audio is not encodable',
    );
  });

  it('rejects an active visual with a missing source before opening native export', async () => {
    const value = request({ importedVideo: true });
    value.snapshot.duration = 0.1;
    value.snapshot.render.fps = 1;
    value.snapshot.composition.assets[0].src = '';
    exportRuntime.prepareExport.mockRejectedValueOnce(new Error('The media asset source is unavailable.'));
    const beginExport = vi.fn().mockResolvedValue({ jobId: 'job-missing-screen', canceled: false });
    setCapture({
      beginExport,
      writeExportChunk: vi.fn().mockResolvedValue(undefined),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(exportWithMediabunny(value, vi.fn(), new AbortController().signal)).rejects.toThrow(
      /asset|source|unavailable|missing/i,
    );
    expect(beginExport).not.toHaveBeenCalled();
    expect(exportRuntime.createProvider).not.toHaveBeenCalled();
  });

  it('does not load an image asset referenced only by a disabled clip', async () => {
    const imageSource = globalThis.Image;
    class BrokenImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: BrokenImage });
    try {
      const value = request();
      value.snapshot.duration = 0.1;
      value.snapshot.render.fps = 1;
      value.snapshot.composition.assets.push({
        id: 'disabled-image-asset',
        kind: 'image',
        name: 'Disabled image',
        fileName: 'disabled.png',
        durationMs: 5_000,
        width: 640,
        height: 360,
        src: 'project-media://asset/disabled.png',
        origin: 'project',
      });
      value.snapshot.composition.clips.push({
        id: 'disabled-image',
        kind: 'image',
        name: 'Disabled image',
        assetId: 'disabled-image-asset',
        timelineStartMs: 0,
        timelineDurationMs: 100,
        sourceInMs: 0,
        sourceDurationMs: 100,
        playbackRate: 1,
        enabled: false,
        order: 1,
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: {
          shadowSize: 'none',
          shadowBlur: 0,
          shadowMode: 'solid',
          cornerRadius: 'none',
          shadowColor: '#000000',
          shadowDirection: 'all',
          borderEnabled: false,
          borderColor: '#000000',
          borderWidth: 0,
          frame: 'none',
          frameTitle: '',
          frameColor: '#c0c0c0',
          frameShowMenu: true,
          frameShowScrollbars: true,
          frameChromeScale: 1,
        },
        isMirrored: false,
        isMirroredY: false,
      });
      const beginExport = vi.fn().mockResolvedValue({ jobId: 'job-disabled-image', canceled: false });
      setCapture({
        beginExport,
        writeExportChunk: vi.fn().mockResolvedValue(undefined),
        finalizeExport: vi.fn().mockResolvedValue({ path: '/tmp/disabled-image.webm' }),
        abortExport: vi.fn().mockResolvedValue(undefined),
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

      await expect(exportWithMediabunny(value, vi.fn(), new AbortController().signal)).resolves.toMatchObject({
        path: '/tmp/disabled-image.webm',
      });
      expect(beginExport).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: imageSource });
    }
  });

  it('maps native cancellation and missing canvas contexts to actionable errors', async () => {
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as CanvasRenderingContext2D);
    setCapture({ beginExport: vi.fn().mockResolvedValue({ jobId: 'job', canceled: true }) });
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toMatchObject({ name: 'AbortError' });

    setCapture({ beginExport: vi.fn().mockResolvedValue(undefined) });
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toMatchObject({ name: 'AbortError' });

    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job', canceled: false }),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    getContext.mockReturnValue(null);
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toThrow('Canvas 2D');
  });

  it('loads assets, renders frames, reports progress, and finalizes a native export', async () => {
    const value = request();
    value.snapshot.duration = 0.1;
    value.snapshot.render.fps = 1;
    const beginExport = vi.fn().mockResolvedValue({ jobId: 'job-success', canceled: false });
    const finalizeExport = vi.fn().mockResolvedValue({ path: 'C:/exports/demo.webm' });
    setCapture({
      beginExport,
      writeExportChunk: vi.fn().mockResolvedValue(undefined),
      finalizeExport,
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const onProgress = vi.fn();

    await expect(exportWithMediabunny(value, onProgress, new AbortController().signal)).resolves.toEqual({
      path: 'C:/exports/demo.webm',
      format: 'webm',
    });
    expect(beginExport).toHaveBeenCalledWith({ projectName: 'Demo', format: 'webm' });
    expect(exportRuntime.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'screen-asset', kind: 'video' }),
      [0],
    );
    expect(exportRuntime.renderFrame).toHaveBeenCalled();
    expect(exportRuntime.outputs[0].addVideoFrame).toHaveBeenCalledWith(0, 1);
    expect(exportRuntime.outputs[0].start).toHaveBeenCalled();
    expect(exportRuntime.outputs[0].finalize).toHaveBeenCalled();
    expect(finalizeExport).toHaveBeenCalledWith('job-success');
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual([
      'loading_assets',
      'audio_mixing',
      'encoding',
      'finalizing',
    ]);
  });

  it.each([24, 30, 60])('keeps composition time in seconds while changing frame density at %d FPS', async (fps) => {
    const value = request();
    value.snapshot.duration = 1;
    value.snapshot.render.fps = fps;
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: `job-fps-${fps}`, canceled: false }),
      writeExportChunk: vi.fn().mockResolvedValue(undefined),
      finalizeExport: vi.fn().mockResolvedValue({ path: `/tmp/fps-${fps}.webm` }),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    await expect(exportWithMediabunny(value, vi.fn(), new AbortController().signal)).resolves.toMatchObject({
      path: `/tmp/fps-${fps}.webm`,
    });

    const frames = exportRuntime.outputs[0]?.addVideoFrame.mock.calls ?? [];
    expect(frames).toHaveLength(fps);
    expect(frames[0]).toEqual([0, 1 / fps]);
    expect(frames.at(-1)?.[0]).toBeCloseTo((fps - 1) / fps);
    expect(frames.every(([, duration]) => duration === 1 / fps)).toBe(true);
    expect(exportRuntime.mixAudio).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('renders an image-only composition at the explicit 30 FPS product rate', async () => {
    const value = request({ screen: false });
    value.snapshot.duration = 0.5;
    value.snapshot.render.fps = 30;
    value.snapshot.background = { kind: 'color', color: '#111' };
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job-image-only', canceled: false }),
      writeExportChunk: vi.fn().mockResolvedValue(undefined),
      finalizeExport: vi.fn().mockResolvedValue({ path: '/tmp/image-only.webm' }),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    await exportWithMediabunny(value, vi.fn(), new AbortController().signal);

    expect(exportRuntime.outputs[0]?.addVideoFrame).toHaveBeenCalledTimes(15);
    expect(exportRuntime.outputOptions[0]?.[0]).toMatchObject({ frameRate: 30 });
    expect(exportRuntime.createProvider).not.toHaveBeenCalled();
  });

  it('passes the editor cursor size and motion settings through the export renderer', async () => {
    const value = request();
    value.snapshot.duration = 0.1;
    value.snapshot.render.fps = 1;
    value.snapshot.cursorSettings.size = 50;
    value.snapshot.cursorSettings.motion = { preset: 'custom', smoothing: 0, springMassMultiplier: 0.5, motionBlur: 0 };
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job-settings', canceled: false }),
      writeExportChunk: vi.fn().mockResolvedValue(undefined),
      finalizeExport: vi.fn().mockResolvedValue({ path: 'C:/exports/settings.webm' }),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    await exportWithMediabunny(value, vi.fn(), new AbortController().signal);

    expect(exportRuntime.renderFrame.mock.calls.at(-1)?.[2].cursorSettings).toMatchObject({
      size: 50,
      motion: { preset: 'custom', smoothing: 0, springMassMultiplier: 0.5, motionBlur: 0 },
    });
  });

  it('cancels the output and native job when the export signal aborts during encoding', async () => {
    const value = request();
    value.snapshot.duration = 2;
    value.snapshot.render.fps = 1;
    const abortExport = vi.fn().mockResolvedValue(undefined);
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job-aborted', canceled: false }),
      abortExport,
      writeExportChunk: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const controller = new AbortController();
    exportRuntime.renderFrame.mockImplementationOnce(() => controller.abort());
    await expect(exportWithMediabunny(value, vi.fn(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(exportRuntime.outputs[0].cancel).toHaveBeenCalled();
    expect(abortExport).toHaveBeenCalledWith('job-aborted');
  });

  it('uses the shared frame provider for video backgrounds and passes clip-id visuals to the renderer', async () => {
    const value = request();
    value.snapshot.duration = 0.1;
    value.snapshot.render.fps = 1;
    value.snapshot.background = { kind: 'video', src: 'project-media://background/bg.mp4' };
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job-background-video', canceled: false }),
      finalizeExport: vi.fn().mockResolvedValue({ path: '/tmp/background.webm' }),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    await exportWithMediabunny(value, vi.fn(), new AbortController().signal);

    expect(exportRuntime.createProvider).toHaveBeenCalledTimes(2);
    expect(exportRuntime.renderFrame.mock.calls.at(-1)?.[6]).toBeInstanceOf(Map);
    expect(exportRuntime.renderFrame.mock.calls.at(-1)?.[4]).toEqual(
      expect.objectContaining({ width: 1_920, height: 1_080 }),
    );
  });

  it('loads image backgrounds as explicit renderable media', async () => {
    const imageSource = globalThis.Image;
    class LoadedImage {
      naturalWidth = 320;
      naturalHeight = 180;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: LoadedImage });
    try {
      const value = request();
      value.snapshot.duration = 0.1;
      value.snapshot.render.fps = 1;
      value.snapshot.background = { kind: 'image', src: 'project-media://background/poster.png' };
      setCapture({
        beginExport: vi.fn().mockResolvedValue({ jobId: 'job-background-image', canceled: false }),
        finalizeExport: vi.fn().mockResolvedValue({ path: '/tmp/background-image.webm' }),
        abortExport: vi.fn().mockResolvedValue(undefined),
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

      await exportWithMediabunny(value, vi.fn(), new AbortController().signal);

      expect(exportRuntime.createProvider).toHaveBeenCalledTimes(1);
      expect(exportRuntime.renderFrame.mock.calls.at(-1)?.[4]).toMatchObject({ width: 320, height: 180 });
    } finally {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: imageSource });
    }
  });

  it('configures MP4 output without an audio track when audio is absent', async () => {
    const value = request();
    value.format = 'mp4';
    value.snapshot.duration = 0.1;
    value.snapshot.render.fps = 1;
    setCapture({
      beginExport: vi.fn().mockResolvedValue({ jobId: 'job-mp4', canceled: false }),
      finalizeExport: vi.fn().mockResolvedValue({ path: '/tmp/demo.mp4' }),
      abortExport: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

    await exportWithMediabunny(value, vi.fn(), new AbortController().signal);

    expect(exportRuntime.outputOptions[0]?.[0]).toMatchObject({ format: 'mp4', audioCodec: null });
  });
});
