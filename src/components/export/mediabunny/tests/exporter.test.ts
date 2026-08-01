import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTPUT_CANVAS } from "../../../video-editor/canvas/output-canvas";
import type { ClipComposition, MediaAsset } from "../../../video-editor/composition/composition-types";
import type { ExportRequest } from "../../export-types";
import { exportWithMediabunny, renderMixedAudio, supportedAudioCodec, supportedVideoCodec } from "../exporter";

const { videoCodec, audioCodec, renderedAudio } = vi.hoisted(() => ({
  videoCodec: vi.fn(),
  audioCodec: vi.fn(),
  renderedAudio: { duration: 3 } as AudioBuffer,
}));

vi.mock("mediabunny", () => ({
  AudioBufferSource: class AudioBufferSource {
    add = vi.fn();
    constructor(...args: unknown[]) { void args; }
  },
  CanvasSource: class CanvasSource {
    add = vi.fn();
    constructor(...args: unknown[]) { void args; }
  },
  Mp4OutputFormat: class Mp4OutputFormat {},
  Output: class Output {
    addAudioTrack = vi.fn();
    addVideoTrack = vi.fn();
    start = vi.fn(async () => undefined);
    finalize = vi.fn(async () => undefined);
    cancel = vi.fn(async () => undefined);
    constructor(...args: unknown[]) { void args; }
  },
  StreamTarget: class StreamTarget {
    constructor(...args: unknown[]) { void args; }
  },
  WebMOutputFormat: class WebMOutputFormat {},
  getFirstEncodableAudioCodec: audioCodec,
  getFirstEncodableVideoCodec: videoCodec,
  ALL_FORMATS: [],
  BlobSource: class BlobSource {
    constructor(...args: unknown[]) { void args; }
  },
  Input: class Input {},
  VideoSampleSink: class VideoSampleSink {},
}));

const screenAsset = (): MediaAsset => ({
  id: "screen-asset", kind: "video", name: "Session", fileName: "session.mp4", durationMs: 2_000,
  width: 1_920, height: 1_080, src: "session.mp4", origin: "session",
});

const audioAsset = (): MediaAsset => ({
  id: "audio-asset", kind: "audio", name: "Music", fileName: "music.wav", durationMs: 3_000,
  width: null, height: null, src: "music.wav", origin: "project",
});

const composition = (options: { screen?: boolean; audio?: boolean; audioEnabled?: boolean } = {}): ClipComposition => {
  const assets: MediaAsset[] = options.screen === false ? [] : [screenAsset()];
  const clips: ClipComposition["clips"] = options.screen === false ? [] : [{
    id: "screen", kind: "screen", name: "Session", assetId: "screen-asset", timelineStartMs: 0,
    timelineDurationMs: 2_000, sourceInMs: 0, sourceDurationMs: 2_000, playbackRate: 1, enabled: true,
    order: 0, transform: { x: 0, y: 0, width: 1, height: 1 },
  }];
  if (options.audio) {
    assets.push(audioAsset());
    clips.push({
      id: "audio", kind: "audio", name: "Music", assetId: "audio-asset", role: "imported",
      timelineStartMs: 200, timelineDurationMs: 1_500, sourceInMs: 100, sourceDurationMs: 1_500,
      playbackRate: 1.25, enabled: options.audioEnabled !== false, order: clips.length, volume: 150,
    });
  }
  return { schemaVersion: 1, assets, clips } as ClipComposition;
};

const request = (options: { screen?: boolean; audio?: boolean; audioEnabled?: boolean } = {}): ExportRequest => ({
  projectName: "Demo", format: "webm", preset: "medium",
  snapshot: {
    duration: 2, render: { fps: 30, sourceWidth: 1_920, sourceHeight: 1_080 },
    canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 1_920, height: 1_080 }, background: null, blurPercent: 0, zooms: [],
    cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
    cursorSettings: {
      selectedCursor: "automatic", size: 24, color: "#fff",
      shadow: { enabled: false, blur: 0, color: "#000", direction: "bottom" },
      clickEffects: {
        left: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: "#f00" },
        right: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: "#00f" },
      },
    },
    composition: composition(options),
  },
});

const setCapture = (value: Record<string, unknown>) => {
  Object.defineProperty(window, "capture", { configurable: true, value });
};

const gain = { gain: { value: 1 }, connect: vi.fn() };
gain.connect.mockImplementation(() => ({}));

class FakeOfflineAudioContext {
  readonly destination = {};
  readonly createBufferSource = vi.fn(() => {
    const source = { buffer: null as AudioBuffer | null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn() };
    source.connect.mockImplementation(() => gain);
    return source;
  });
  readonly createGain = vi.fn(() => gain);
  readonly decodeAudioData = vi.fn(async () => ({ duration: 2 } as AudioBuffer));
  readonly startRendering = vi.fn(async () => renderedAudio);

  constructor(public readonly channels: number, public readonly length: number, public readonly sampleRate: number) {}
}

beforeEach(() => {
  vi.clearAllMocks();
  videoCodec.mockReturnValue("vp9");
  audioCodec.mockReturnValue("opus");
});

afterEach(() => {
  delete (window as Window & { capture?: unknown }).capture;
  delete (window as Window & { OfflineAudioContext?: unknown }).OfflineAudioContext;
  vi.restoreAllMocks();
});

describe("mediabunny exporter", () => {
  it("selects the format-specific video codec and bitrate", () => {
    const value = request();
    expect(supportedVideoCodec(value)).toBe("vp9");
    expect(videoCodec).toHaveBeenCalledWith(["vp9", "vp8", "av1"], expect.objectContaining({ width: 1_920, height: 1_080, bitrate: expect.any(Number) }));

    value.format = "mp4";
    supportedVideoCodec(value);
    expect(videoCodec).toHaveBeenLastCalledWith(["avc"], expect.objectContaining({ width: 1_920, height: 1_080 }));
  });

  it("only probes audio codecs when an enabled audio clip exists", async () => {
    expect(await supportedAudioCodec(request())).toBeNull();
    expect(audioCodec).not.toHaveBeenCalled();

    const value = request({ audio: true });
    expect(await supportedAudioCodec(value)).toBe("opus");
    expect(audioCodec).toHaveBeenCalledWith(["opus"], { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 });

    value.format = "mp4";
    await supportedAudioCodec(value);
    expect(audioCodec).toHaveBeenLastCalledWith(["aac"], expect.any(Object));
  });

  it("mixes enabled audio clips with clamped gain and source offsets", async () => {
    Object.defineProperty(window, "OfflineAudioContext", { configurable: true, value: FakeOfflineAudioContext });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));

    const result = await renderMixedAudio(request({ audio: true }));

    expect(result).toBe(renderedAudio);
  });

  it("handles empty, unavailable, missing, and unreadable audio sources", async () => {
    expect(await renderMixedAudio(request())).toBeNull();
    await expect(renderMixedAudio(request({ audio: true }))).rejects.toThrow("Offline audio mixing");

    Object.defineProperty(window, "OfflineAudioContext", { configurable: true, value: FakeOfflineAudioContext });
    const missing = request({ audio: true });
    missing.snapshot.composition.assets = [];
    await expect(renderMixedAudio(missing)).rejects.toThrow("audio sidecar");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    await expect(renderMixedAudio(request({ audio: true }))).rejects.toThrow("audio sidecar");
  });

  it("rejects invalid sessions and unsupported codecs before opening native export", async () => {
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    await expect(exportWithMediabunny(request({ screen: false }), onProgress, signal)).rejects.toThrow("session video");

    videoCodec.mockReturnValueOnce(null);
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toThrow("not encodable");

    audioCodec.mockReturnValueOnce(null);
    await expect(exportWithMediabunny(request({ audio: true }), onProgress, signal)).rejects.toThrow("audio is not encodable");
  });

  it("maps native cancellation and missing canvas contexts to actionable errors", async () => {
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    setCapture({ beginExport: vi.fn().mockResolvedValue({ jobId: "job", canceled: true }) });
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toMatchObject({ name: "AbortError" });

    setCapture({ beginExport: vi.fn().mockResolvedValue(undefined) });
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toMatchObject({ name: "AbortError" });

    setCapture({ beginExport: vi.fn().mockResolvedValue({ jobId: "job", canceled: false }) });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(exportWithMediabunny(request(), onProgress, signal)).rejects.toThrow("Canvas 2D");
  });
});
