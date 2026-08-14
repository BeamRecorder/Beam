import PlaybackWorker from './playback.worker?worker';
import {
  MediaInputError,
  isVisualClip,
  mediaSourceDescriptor,
  ownedMediaFrame,
  type ClipComposition,
  type MediaError,
  type MediaFrame,
  type MediaSourceDescriptor,
} from '../shared';
import { AudioPlaybackScheduler } from './audio-scheduler';
import { FrameLruCache } from './frame-cache';
import { isPlaybackWorkerResponse } from './playback-protocol';
import type {
  PlaybackClipDescriptor,
  PlaybackEventMap,
  PlaybackMetrics,
  PlaybackSeekMode,
  PlaybackSeekResult,
  PlaybackState,
  PlaybackWorkerRequest,
  PlaybackWorkerResponse,
} from './playback-types';

type WorkerLike = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;
type Listener<K extends keyof PlaybackEventMap> = (value: PlaybackEventMap[K]) => void;

export class MediaPlaybackEngine {
  private readonly worker: WorkerLike;
  private readonly audio: AudioPlaybackScheduler;
  private readonly cache = new FrameLruCache();
  private readonly currentFrameKeys = new Map<string, string>();
  private readonly reportedIssueSignatures = new Set<string>();
  private readonly listeners = new Map<keyof PlaybackEventMap, Set<(value: never) => void>>();
  private readonly pendingSeeks = new Map<
    number,
    { mode: PlaybackSeekMode; resolve(result: PlaybackSeekResult): void }
  >();
  private readonly pendingLoads = new Map<number, { resolve(): void; reject(error: Error): void }>();
  private composition: ClipComposition | null = null;
  private generation = 0;
  private nextRequestId = 1;
  private animationFrame: number | null = null;
  private currentSeconds = 0;
  private playbackState: PlaybackState = 'idle';
  private metrics: PlaybackMetrics = {
    decodedFrames: 0,
    presentedFrames: 0,
    droppedFrames: 0,
    supersededRequests: 0,
    queueSize: 0,
    cacheBytes: 0,
    disposedBitmaps: 0,
    seekLatencyMs: [],
  };

  constructor(options: { workerFactory?: () => WorkerLike; audio?: AudioPlaybackScheduler } = {}) {
    this.worker = options.workerFactory?.() ?? new PlaybackWorker();
    this.audio = options.audio ?? new AudioPlaybackScheduler((error) => this.fail(error));
    this.worker.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
    this.worker.onerror = () => {
      const error: MediaError = {
        kind: 'decode-failure',
        sourceId: 'playback-worker',
        message: 'The playback worker stopped unexpectedly.',
      };
      for (const pending of this.pendingLoads.values()) pending.reject(new MediaInputError(error));
      this.pendingLoads.clear();
      for (const pending of this.pendingSeeks.values()) pending.resolve('superseded');
      this.pendingSeeks.clear();
      this.fail(error);
    };
  }

  async loadComposition(composition: ClipComposition): Promise<void> {
    this.assertActive();
    this.pause();
    this.composition = composition;
    this.currentSeconds = 0;
    this.cache.clear();
    this.currentFrameKeys.clear();
    this.setState('loading');
    const requestGeneration = ++this.generation;
    for (const pending of this.pendingLoads.values()) pending.resolve();
    this.pendingLoads.clear();
    try {
      const { clips, assets, issues } = this.videoPlaybackPlan(composition);
      const workerReady = new Promise<void>((resolve, reject) => {
        this.pendingLoads.set(requestGeneration, { resolve, reject });
      });
      this.post({ type: 'load', generation: requestGeneration, assets, clips });
      const [, audioIssues] = await Promise.all([workerReady, this.audio.loadComposition(composition)]);
      if (requestGeneration !== this.generation) return;
      this.setState('paused');
      for (const issue of [...issues, ...audioIssues]) this.reportIssue(issue);
      await this.seek(0, 'seek');
    } catch (error) {
      if (requestGeneration !== this.generation) return;
      const detail = this.toMediaError(error, 'composition');
      this.fail(detail);
      throw error;
    } finally {
      this.pendingLoads.delete(requestGeneration);
    }
  }

  async play(timelineSeconds = this.currentSeconds): Promise<void> {
    this.assertReady();
    const clamped = this.clampTime(timelineSeconds);
    const requestGeneration = ++this.generation;
    this.currentSeconds = clamped;
    try {
      await this.audio.play(clamped, requestGeneration);
    } catch (error) {
      if (requestGeneration === this.generation) this.fail(this.toMediaError(error, 'audio-playback'));
      throw error;
    }
    if (requestGeneration !== this.generation) return;
    this.post({ type: 'play', generation: requestGeneration, timelineSeconds: clamped });
    this.setState('playing');
    this.startClock();
  }

  pause(): void {
    if (this.playbackState === 'disposed') return;
    if (this.playbackState === 'playing') this.currentSeconds = this.clampTime(this.audio.currentTime());
    this.generation += 1;
    this.stopClock();
    this.audio.pause(this.currentSeconds);
    this.post({ type: 'pause', generation: this.generation });
    if (this.playbackState !== 'idle' && this.playbackState !== 'loading') this.setState('paused');
  }

  async seek(timelineSeconds: number, mode: PlaybackSeekMode): Promise<PlaybackSeekResult> {
    this.assertReady();
    const target = this.clampTime(timelineSeconds);
    const resume = this.playbackState === 'playing';
    const requestGeneration = ++this.generation;
    const requestId = this.nextRequestId++;
    this.currentSeconds = target;
    this.emit('time', target);
    await this.audio.seek(target, requestGeneration, resume);
    if (requestGeneration !== this.generation) return 'superseded';
    const result = new Promise<PlaybackSeekResult>((resolve) => this.pendingSeeks.set(requestId, { mode, resolve }));
    this.post({ type: 'seek', generation: requestGeneration, requestId, timelineSeconds: target, mode });
    return result;
  }

  frameFor(clipId: string): MediaFrame | null {
    const key = this.currentFrameKeys.get(clipId);
    return key ? (this.cache.get(key) ?? null) : null;
  }

  on<K extends keyof PlaybackEventMap>(event: K, listener: Listener<K>): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener as (value: never) => void);
    return () => listeners!.delete(listener as (value: never) => void);
  }

  get state(): PlaybackState {
    return this.playbackState;
  }

  get currentTime(): number {
    return this.currentSeconds;
  }

  get developmentMetrics(): PlaybackMetrics {
    return { ...this.metrics, seekLatencyMs: [...this.metrics.seekLatencyMs], cacheBytes: this.cache.byteSize };
  }

  setVolume(percent: number): void {
    this.audio.setVolume(percent);
  }

  dispose(): void {
    if (this.playbackState === 'disposed') return;
    this.stopClock();
    this.audio.dispose();
    this.post({ type: 'dispose' });
    this.worker.terminate();
    this.cache.clear();
    this.currentFrameKeys.clear();
    for (const pending of this.pendingSeeks.values()) pending.resolve('superseded');
    this.pendingSeeks.clear();
    for (const pending of this.pendingLoads.values()) pending.reject(new Error('Playback engine disposed.'));
    this.pendingLoads.clear();
    this.composition = null;
    this.setState('disposed');
    this.listeners.clear();
  }

  private receive(value: unknown) {
    if (!isPlaybackWorkerResponse(value)) {
      if (
        value &&
        typeof value === 'object' &&
        'bitmap' in value &&
        typeof ImageBitmap !== 'undefined' &&
        value.bitmap instanceof ImageBitmap
      ) {
        value.bitmap.close();
      }
      this.fail({ kind: 'decode-failure', sourceId: 'playback-worker', message: 'Invalid playback worker response.' });
      return;
    }
    const message: PlaybackWorkerResponse = value;
    if (message.type === 'seek-result') {
      this.pendingSeeks.get(message.requestId)?.resolve(message.result);
      this.pendingSeeks.delete(message.requestId);
      return;
    }
    if (message.type === 'ready') {
      this.pendingLoads.get(message.generation)?.resolve();
      return;
    }
    if (message.type === 'error') {
      if (message.requestId !== undefined) {
        this.pendingSeeks.get(message.requestId)?.resolve('superseded');
        this.pendingSeeks.delete(message.requestId);
      }
      this.pendingLoads.get(message.generation)?.reject(new MediaInputError(message.error));
      if (message.generation === this.generation) this.fail(message.error);
      return;
    }
    if (message.type === 'metrics') {
      if (message.generation !== this.generation) return;
      this.metrics = { ...message.metrics, cacheBytes: this.cache.byteSize };
      this.emit('metrics', this.developmentMetrics);
      return;
    }
    const pendingSeek = message.requestId === undefined ? null : this.pendingSeeks.get(message.requestId);
    const isPendingScrubFrame = pendingSeek?.mode === 'scrub';
    if (message.generation !== this.generation && !isPendingScrubFrame) {
      message.bitmap.close();
      this.metrics.disposedBitmaps += 1;
      this.metrics.droppedFrames += 1;
      return;
    }
    const frame = ownedMediaFrame(message.clipId, message.bitmap, message.timestampSeconds, message.durationSeconds);
    const key = `${message.clipId}:${message.timestampSeconds}`;
    this.currentFrameKeys.set(message.clipId, key);
    const evicted = this.cache.set(key, frame);
    for (const evictedKey of evicted) {
      for (const [clipId, currentKey] of this.currentFrameKeys) {
        if (currentKey === evictedKey) this.currentFrameKeys.delete(clipId);
      }
    }
    this.emit('frame', { clipId: message.clipId });
  }

  private startClock() {
    this.stopClock();
    const tick = () => {
      if (this.playbackState !== 'playing') return;
      this.currentSeconds = this.clampTime(this.audio.currentTime());
      this.emit('time', this.currentSeconds);
      this.post({ type: 'tick', generation: this.generation, timelineSeconds: this.currentSeconds });
      if (this.currentSeconds >= this.durationSeconds && this.durationSeconds > 0) {
        void this.seek(0, 'seek');
      }
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  private stopClock() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private videoClips(composition: ClipComposition): PlaybackClipDescriptor[] {
    return composition.clips.flatMap((clip) => {
      if (!clip.enabled || !isVisualClip(clip) || clip.kind === 'image') return [];
      return [
        {
          clipId: clip.id,
          assetId: clip.assetId,
          timelineStartSeconds: clip.timelineStartMs / 1_000,
          timelineDurationSeconds: clip.timelineDurationMs / 1_000,
          sourceInSeconds: clip.sourceInMs / 1_000,
          playbackRate: clip.playbackRate,
        },
      ];
    });
  }

  private videoPlaybackPlan(composition: ClipComposition): {
    clips: PlaybackClipDescriptor[];
    assets: MediaSourceDescriptor[];
    issues: MediaError[];
  } {
    const requestedClips = this.videoClips(composition);
    const assetsById = new Map(composition.assets.map((asset) => [asset.id, asset]));
    const descriptors = new Map<string, MediaSourceDescriptor>();
    const issues = new Map<string, MediaError>();
    for (const assetId of new Set(requestedClips.map((clip) => clip.assetId))) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        issues.set(assetId, {
          kind: 'missing',
          sourceId: assetId,
          message: 'A playback clip references a missing media asset.',
        });
        continue;
      }
      try {
        const descriptor = mediaSourceDescriptor(asset);
        if (descriptor.kind !== 'video') throw new Error('The playback asset is not a video.');
        descriptors.set(assetId, descriptor);
      } catch (error) {
        issues.set(assetId, this.toMediaError(error, assetId));
      }
    }
    return {
      assets: [...descriptors.values()],
      clips: requestedClips.filter((clip) => descriptors.has(clip.assetId)),
      issues: [...issues.values()],
    };
  }

  private get durationSeconds(): number {
    return (
      (this.composition?.clips.reduce(
        (end, clip) => Math.max(end, clip.timelineStartMs + clip.timelineDurationMs),
        0,
      ) ?? 0) / 1_000
    );
  }

  private clampTime(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError('Playback time must be finite.');
    return Math.max(0, Math.min(value, this.durationSeconds));
  }

  private post(message: PlaybackWorkerRequest) {
    this.worker.postMessage(message);
  }

  private emit<K extends keyof PlaybackEventMap>(event: K, value: PlaybackEventMap[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(value as never);
  }

  private setState(state: PlaybackState) {
    if (this.playbackState === state) return;
    this.playbackState = state;
    this.emit('state', state);
  }

  private fail(error: MediaError) {
    if (this.playbackState === 'disposed') return;
    console.error('[Beam media:playback] Playback failed.', error);
    this.stopClock();
    this.playbackState = 'error';
    this.emit('error', error);
    this.emit('state', 'error');
  }

  private reportIssue(error: MediaError) {
    const signature = `${error.kind}:${error.sourceId}:${error.message}`;
    if (!this.reportedIssueSignatures.has(signature)) {
      this.reportedIssueSignatures.add(signature);
      console.error('[Beam media:playback] Media skipped during playback.', error);
    }
    this.emit('error', error);
  }

  private toMediaError(error: unknown, sourceId: string): MediaError {
    return error instanceof MediaInputError
      ? error.detail
      : { kind: 'decode-failure', sourceId, message: error instanceof Error ? error.message : 'Playback failed.' };
  }

  private assertActive() {
    if (this.playbackState === 'disposed') throw new Error('Playback engine is disposed.');
  }

  private assertReady() {
    this.assertActive();
    if (!this.composition || this.playbackState === 'idle' || this.playbackState === 'loading') {
      throw new Error('Playback composition is not loaded.');
    }
  }
}
