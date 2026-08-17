import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportRequest } from '../../export-types';
import { openExportAssets } from '../export-worker-assets';

const runtime = vi.hoisted(() => ({
  mediaSourceDescriptor: vi.fn(),
  openMediaInput: vi.fn(),
}));

vi.mock('~/media/shared', () => ({
  mediaSourceDescriptor: runtime.mediaSourceDescriptor,
  openMediaInput: runtime.openMediaInput,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const asset = (id: string, kind: 'video' | 'audio' = 'video') => ({
  id,
  kind,
  name: `Asset ${id}`,
  fileName: `${id}.webm`,
  durationMs: 10_000,
  width: 1920,
  height: 1080,
  src: `project-media://${id}`,
  origin: 'project',
});

const visualClip = (assetId: string, kind: 'screen' | 'video' = 'video') => ({
  id: `${kind}-${assetId}`,
  kind,
  name: `${kind} ${assetId}`,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
});

const audioClip = (assetId: string) => ({
  id: `audio-${assetId}`,
  kind: 'audio',
  name: `audio ${assetId}`,
  assetId,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  role: 'imported',
  volume: 1,
  enabled: true,
  order: 1,
});

const request = (assets: unknown[], clips: unknown[]) =>
  ({
    projectName: 'Asset test',
    format: 'webm',
    preset: 'medium',
    snapshot: {
      duration: 1,
      render: { fps: 30, sourceWidth: null, sourceHeight: null },
      canvas: { width: 1920, height: 1080 },
      background: null,
      blurPercent: 0,
      zooms: [],
      cursor: { available: false, events: [], telemetry: [], shapes: {}, catalog: {}, missing: [] },
      cursorSettings: {
        selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
        size: 24,
        color: '#000000',
      },
      cursorPack: {
        id: 'builtin:macos',
        name: 'macOS',
        source: 'builtin',
        colorMode: 'original',
        defaultCursorId: 'default',
        cursors: [],
        automaticMap: {},
      },
      composition: { schemaVersion: 3, assets, clips, keyboardCaptionSessions: [] },
    },
  }) as unknown as ExportRequest;

const videoTrack = (width = 1920, height = 1080) => ({
  canDecode: vi.fn().mockResolvedValue(true),
  getDisplayWidth: vi.fn().mockResolvedValue(width),
  getDisplayHeight: vi.fn().mockResolvedValue(height),
});

const audioTrack = () => ({ canDecode: vi.fn().mockResolvedValue(true) });

const openedInput = (options: {
  video?: ReturnType<typeof videoTrack> | null;
  audio?: ReturnType<typeof audioTrack> | null;
  metadata?: number | null | Promise<number | null>;
  computed?: number;
}) => {
  const video = options.video === undefined ? videoTrack() : options.video;
  const audio = options.audio === undefined ? audioTrack() : options.audio;
  const dispose = vi.fn();
  const input = {
    getPrimaryVideoTrack: vi.fn().mockResolvedValue(video),
    getPrimaryAudioTrack: vi.fn().mockResolvedValue(audio),
    getDurationFromMetadata: vi.fn().mockResolvedValue(options.metadata === undefined ? 10 : options.metadata),
    computeDuration: vi.fn().mockResolvedValue(options.computed ?? 10),
  };
  return {
    descriptor: {},
    input,
    dispose,
  };
};

describe('openExportAssets', () => {
  beforeEach(() => {
    runtime.mediaSourceDescriptor.mockReset().mockImplementation((value) => ({ assetId: value.id, url: value.src }));
    runtime.openMediaInput.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not require or open audio-only assets when audio is excluded', async () => {
    const withoutAudio = { ...request([], [audioClip('missing')]), includeAudio: false };

    const result = await openExportAssets(withoutAudio, new AbortController().signal, vi.fn());

    expect(runtime.openMediaInput).not.toHaveBeenCalled();
    expect(result.assets.size).toBe(0);
    result.dispose();
  });

  it('opens each required asset once and reuses its video/audio tracks', async () => {
    const shared = asset('shared');
    const opened = openedInput({ metadata: 4.5 });
    runtime.openMediaInput.mockResolvedValueOnce(opened);
    const validated = vi.fn();

    const result = await openExportAssets(
      request([shared], [visualClip(shared.id, 'screen'), audioClip(shared.id)]),
      new AbortController().signal,
      validated,
    );

    expect(runtime.mediaSourceDescriptor).toHaveBeenCalledOnce();
    expect(runtime.mediaSourceDescriptor).toHaveBeenCalledWith(shared);
    expect(runtime.openMediaInput).toHaveBeenCalledOnce();
    expect(opened.input.getPrimaryVideoTrack).toHaveBeenCalledOnce();
    expect(opened.input.getPrimaryAudioTrack).toHaveBeenCalledOnce();
    expect(opened.input.getDurationFromMetadata).toHaveBeenCalledWith([
      await opened.input.getPrimaryVideoTrack.mock.results[0]!.value,
      await opened.input.getPrimaryAudioTrack.mock.results[0]!.value,
    ]);
    expect(opened.input.computeDuration).not.toHaveBeenCalled();
    expect(result.assets.get(shared.id)).toMatchObject({ asset: shared, duration: 4.5 });
    expect(validated).toHaveBeenCalledWith(1, 1);
    expect(result.screenSize).toEqual({ width: 1920, height: 1080 });

    result.dispose();
    result.dispose();
    expect(opened.dispose).toHaveBeenCalledOnce();
  });

  it('keeps asset validation concurrency bounded to four workers', async () => {
    const assets = Array.from({ length: 6 }, (_, index) => asset(`asset-${index}`));
    const handles = new Map(assets.map((value) => [value.id, openedInput({ metadata: 2 })]));
    const gates = new Map<string, Deferred<void>>();
    let active = 0;
    let maximumActive = 0;
    runtime.openMediaInput.mockImplementation(async (descriptor: { assetId: string }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const gate = deferred<void>();
      gates.set(descriptor.assetId, gate);
      await gate.promise;
      active -= 1;
      return handles.get(descriptor.assetId);
    });

    const opening = openExportAssets(
      request(
        assets,
        assets.map((value, index) => visualClip(value.id, index === 0 ? 'screen' : 'video')),
      ),
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(runtime.openMediaInput).toHaveBeenCalledTimes(4));
    expect(runtime.openMediaInput).toHaveBeenCalledTimes(4);
    expect(maximumActive).toBe(4);

    for (const value of assets.slice(0, 4)) gates.get(value.id)!.resolve();
    await vi.waitFor(() => expect(runtime.openMediaInput).toHaveBeenCalledTimes(6));
    for (const gate of gates.values()) gate.resolve();

    const result = await opening;
    expect(maximumActive).toBe(4);
    expect(result.assets.size).toBe(6);
    result.dispose();
    for (const handle of handles.values()) expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it('uses metadata duration first and falls back to computeDuration with skipLiveWait', async () => {
    const metadataAsset = asset('metadata');
    const metadataOpened = openedInput({ metadata: 4.25, computed: 99 });
    runtime.openMediaInput.mockResolvedValueOnce(metadataOpened);
    const metadataResult = await openExportAssets(
      request([metadataAsset], [visualClip(metadataAsset.id, 'screen')]),
      new AbortController().signal,
      vi.fn(),
    );
    expect(metadataResult.assets.get(metadataAsset.id)?.duration).toBe(4.25);
    expect(metadataOpened.input.computeDuration).not.toHaveBeenCalled();
    metadataResult.dispose();

    const fallbackAsset = asset('fallback');
    const fallbackOpened = openedInput({ metadata: null, computed: 8.75 });
    runtime.openMediaInput.mockResolvedValueOnce(fallbackOpened);
    const fallbackResult = await openExportAssets(
      request([fallbackAsset], [visualClip(fallbackAsset.id, 'screen')]),
      new AbortController().signal,
      vi.fn(),
    );
    expect(fallbackResult.assets.get(fallbackAsset.id)?.duration).toBe(8.75);
    expect(fallbackOpened.input.computeDuration).toHaveBeenCalledWith(
      [await fallbackOpened.input.getPrimaryVideoTrack.mock.results[0]!.value],
      { skipLiveWait: true },
    );
    fallbackResult.dispose();
  });

  it('disposes every concurrently opened input exactly once after a late failure', async () => {
    const assets = Array.from({ length: 5 }, (_, index) => asset(`late-${index}`));
    const metadataGates = assets.map(() => deferred<number | null>());
    const handles = new Map(
      assets.map((value, index) => [
        value.id,
        openedInput({ metadata: index === 0 ? 10 : metadataGates[index]!.promise }),
      ]),
    );
    runtime.openMediaInput.mockImplementation(async (descriptor: { assetId: string }) =>
      handles.get(descriptor.assetId),
    );
    const validated = vi.fn();
    const opening = openExportAssets(
      request(
        assets,
        assets.map((value, index) => visualClip(value.id, index === 0 ? 'screen' : 'video')),
      ),
      new AbortController().signal,
      validated,
    );

    await vi.waitFor(() => expect(runtime.openMediaInput).toHaveBeenCalledTimes(5));
    for (const gate of metadataGates.slice(1, 4)) gate.resolve(10);
    metadataGates[4]!.reject(new Error('late asset validation failed'));

    await expect(opening).rejects.toThrow('late asset validation failed');
    expect(Math.max(0, ...validated.mock.calls.map(([count]) => count as number))).toBeLessThan(5);
    for (const handle of handles.values()) expect(handle.dispose).toHaveBeenCalledOnce();
  });
});
