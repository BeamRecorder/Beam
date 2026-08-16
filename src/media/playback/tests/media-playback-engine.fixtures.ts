import { expect, vi } from 'vitest';
import type { MediaPlaybackEngine } from '../media-playback-engine';
import type { PlaybackWorkerRequest, PlaybackWorkerResponse } from '../playback-types';
import type { ClipComposition } from '../../shared';
import { createDefaultClipAppearance } from '../../shared/composition-defaults';

export class FakeImageBitmap {
  readonly width: number;
  readonly height: number;
  readonly close = vi.fn();

  constructor(width = 4, height = 4) {
    this.width = width;
    this.height = height;
  }
}

export class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: PlaybackWorkerRequest[] = [];
  readonly terminate = vi.fn();

  postMessage = vi.fn((message: PlaybackWorkerRequest) => {
    this.requests.push(message);
  });

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

export class FakeAudio {
  readonly loadComposition = vi.fn(async () => []);
  readonly updateComposition = vi.fn();
  readonly play = vi.fn(async () => undefined);
  readonly pause = vi.fn();
  readonly seek = vi.fn(async () => undefined);
  readonly setVolume = vi.fn();
  readonly dispose = vi.fn();
  now = 0;

  currentTime = vi.fn(() => this.now);
}

export const asset = (id = 'asset-1') => ({
  id,
  kind: 'video' as const,
  name: `Video ${id}`,
  fileName: `${id}.mp4`,
  durationMs: 10_000,
  width: 1920,
  height: 1080,
  src: `https://cdn.example.test/${id}.mp4`,
  origin: 'project' as const,
});

export const videoClip = (id: string, assetId = 'asset-1', overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  kind: 'video' as const,
  name: id,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

export const composition = (clips = [videoClip('clip-1')]): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [asset(), asset('unused')],
  clips,
});

export const frameResponse = (
  generation: number,
  clipId: string,
  timestampSeconds: number,
  bitmap = new FakeImageBitmap(),
): PlaybackWorkerResponse => ({
  type: 'frame',
  generation,
  clipId,
  assetId: 'asset-1',
  bitmap: bitmap as unknown as ImageBitmap,
  timestampSeconds,
  durationSeconds: 0.04,
});

export const seekRequest = (worker: FakeWorker) =>
  worker.requests.find(
    (request): request is Extract<PlaybackWorkerRequest, { type: 'seek' }> => request.type === 'seek',
  );

export const latestSeekRequest = (worker: FakeWorker) =>
  [...worker.requests]
    .reverse()
    .find((request): request is Extract<PlaybackWorkerRequest, { type: 'seek' }> => request.type === 'seek');

export let rafCallbacks: FrameRequestCallback[] = [];

export const resetPlaybackGlobals = () => {
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
  rafCallbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
};

export const cleanupPlaybackGlobals = () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
};

export async function load(engine: MediaPlaybackEngine, worker: FakeWorker, value = composition()) {
  const pending = engine.loadComposition(value);
  const loadRequest = worker.requests.find(
    (request): request is Extract<PlaybackWorkerRequest, { type: 'load' }> => request.type === 'load',
  );
  worker.emit({ type: 'ready', generation: loadRequest!.generation });
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  const request = seekRequest(worker);
  expect(request).toBeDefined();
  worker.emit({
    type: 'seek-result',
    generation: request!.generation,
    requestId: request!.requestId,
    result: 'presented',
    latencyMs: 2,
  });
  await pending;
}
