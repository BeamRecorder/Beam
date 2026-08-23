import PlaybackWorker from './playback.worker?worker';
import {
  MediaInputError,
  isVisualClip,
  ownedMediaFrame,
  sourceTimeAt,
  type ClipComposition,
  type MediaError,
  type MediaFrame,
} from '../shared';
import { AudioPlaybackScheduler } from './audio-scheduler';
import { FrameLruCache } from './frame-cache';
import { isPlaybackWorkerResponse } from './playback-protocol';
import { audioPlaybackTopology, videoPlaybackTopology } from './playback-composition-topology';
import { videoPlaybackPlan } from './playback-composition-plan';
import { previousContiguousVisualClipId } from './playback-frame-continuity';
import { isPreviewQuality, type PreviewQuality } from './playback-preview';
import type {
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
const WORKER_DISPOSE_TIMEOUT_MS = 2_000;

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
  private workerDisposeTimer: ReturnType<typeof setTimeout> | null = null;
  private workerTerminated = false;
  private currentSeconds = 0;
  private durationSeconds = 0;
  private playbackState: PlaybackState = 'idle';
  private previewQuality: PreviewQuality;
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

  constructor(
    options: { workerFactory?: () => WorkerLike; audio?: AudioPlaybackScheduler; previewQuality?: PreviewQuality } = {},
  ) {
    if (!isPreviewQuality(options.previewQuality ?? 'full')) throw new RangeError('Invalid playback preview quality.');
    this.previewQuality = options.previewQuality ?? 'full';
    this.worker = options.workerFactory?.() ?? new PlaybackWorker();
    this.audio = options.audio ?? new AudioPlaybackScheduler((error) => this.fail(error));
    this.worker.onmessage = (event: MessageEvent<unknown>) => this.receive(event.data);
    this.worker.onerror = () => {
      if (this.playbackState === 'disposed') {
        this.terminateWorker();
        return;
      }
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

  async loadComposition(composition: ClipComposition, timelineSeconds = this.currentSeconds): Promise<void> {
    this.assertActive();
    if (!Number.isFinite(timelineSeconds)) throw new RangeError('Playback time must be finite.');
    if (this.canRetimeComposition(composition)) return this.retimeComposition(composition, timelineSeconds);
    this.pause();
    this.composition = composition;
    this.durationSeconds = this.compositionDuration(composition);
    this.currentSeconds = this.clampTime(timelineSeconds);
    this.cache.clear();
    this.currentFrameKeys.clear();
    this.setState('loading');
    const requestGeneration = ++this.generation;
    for (const pending of this.pendingLoads.values()) pending.resolve();
    this.pendingLoads.clear();
    try {
      const { clips, assets, issues } = videoPlaybackPlan(composition);
      const workerReady = new Promise<void>((resolve, reject) => {
        this.pendingLoads.set(requestGeneration, { resolve, reject });
      });
      this.post({ type: 'load', generation: requestGeneration, assets, clips, previewQuality: this.previewQuality });
      const [, audioIssues] = await Promise.all([workerReady, this.audio.loadComposition(composition)]);
      if (requestGeneration !== this.generation) return;
      this.setState('paused');
      for (const issue of [...issues, ...audioIssues]) this.reportIssue(issue);
      await this.seek(this.currentSeconds, 'seek');
    } catch (error) {
      if (requestGeneration !== this.generation) return;
      const detail = this.toMediaError(error, 'composition');
      this.fail(detail);
      throw error;
    } finally {
      this.pendingLoads.delete(requestGeneration);
    }
  }

  canRetimeComposition(composition: ClipComposition): boolean {
    return (
      this.composition !== null &&
      this.playbackState !== 'idle' &&
      this.playbackState !== 'loading' &&
      videoPlaybackTopology(this.composition) === videoPlaybackTopology(composition)
    );
  }

  async retimeComposition(composition: ClipComposition, timelineSeconds = this.currentSeconds): Promise<void> {
    this.assertActive();
    if (!this.canRetimeComposition(composition)) throw new Error('Playback topology changed during retiming.');
    if (!Number.isFinite(timelineSeconds)) throw new RangeError('Playback time must be finite.');
    const previousComposition = this.composition!;
    const shouldReloadAudio = audioPlaybackTopology(previousComposition) !== audioPlaybackTopology(composition);
    this.pause();
    this.composition = composition;
    this.durationSeconds = this.compositionDuration(composition);
    this.currentSeconds = this.clampTime(timelineSeconds);
    const requestGeneration = ++this.generation;
    for (const pending of this.pendingLoads.values()) pending.resolve();
    this.pendingLoads.clear();
    try {
      const { clips, issues } = videoPlaybackPlan(composition);
      const activeClipIds = new Set(clips.map((clip) => clip.clipId));
      for (const clipId of this.currentFrameKeys.keys())
        if (!activeClipIds.has(clipId)) this.currentFrameKeys.delete(clipId);
      const workerReady = new Promise<void>((resolve, reject) => {
        this.pendingLoads.set(requestGeneration, { resolve, reject });
      });
      const audioReady = shouldReloadAudio
        ? this.audio.loadComposition(composition)
        : Promise.resolve().then(() => {
            this.audio.updateComposition(composition);
            return [];
          });
      this.post({ type: 'retime', generation: requestGeneration, clips });
      const [, audioIssues] = await Promise.all([workerReady, audioReady]);
      if (requestGeneration !== this.generation) return;
      for (const issue of [...issues, ...audioIssues]) this.reportIssue(issue);
      await this.seek(this.currentSeconds, 'seek');
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

    if (this.composition) {
      for (const clip of this.composition.clips) {
        if (isVisualClip(clip) && clip.enabled) {
          const clipStartSec = clip.timelineStartMs / 1_000;
          const clipEndSec = (clip.timelineStartMs + clip.timelineDurationMs) / 1_000;
          if (target >= clipStartSec && target < clipEndSec) {
            const srcSec =
              clip.freezeFrameSourceMs !== undefined
                ? clip.freezeFrameSourceMs / 1_000
                : (clip.sourceInMs + (target - clipStartSec) * 1_000 * (clip.playbackRate ?? 1)) / 1_000;
            const cachedKey = this.cache.findMatchingKey(clip.id, srcSec, `${this.previewQuality}:`);
            if (cachedKey) {
              this.currentFrameKeys.set(clip.id, cachedKey);
              this.emit('frame', { clipId: clip.id });
            }
          }
        }
      }
    }

    if (mode === 'seek' || resume) {
      await this.audio.seek(target, requestGeneration, resume);
      if (requestGeneration !== this.generation) return 'superseded';
    }
    const result = new Promise<PlaybackSeekResult>((resolve) => this.pendingSeeks.set(requestId, { mode, resolve }));
    this.post({ type: 'seek', generation: requestGeneration, requestId, timelineSeconds: target, mode });
    return result;
  }

  frameFor(clipId: string): MediaFrame | null {
    const clip = this.composition?.clips.find((entry) => entry.id === clipId);
    const timelineTimeMs = this.currentSeconds * 1_000;
    if (!clip || !clip.enabled || !isVisualClip(clip) || sourceTimeAt(clip, timelineTimeMs) === null) {
      return null;
    }
    const key = this.currentFrameKeys.get(clipId);
    if (key) return this.cache.get(key) ?? null;
    const previousClipId = previousContiguousVisualClipId(this.composition!, clipId, timelineTimeMs);
    const previousKey = previousClipId ? this.currentFrameKeys.get(previousClipId) : null;
    return previousKey ? (this.cache.get(previousKey) ?? null) : null;
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

  async setPreviewQuality(quality: PreviewQuality): Promise<void> {
    this.assertActive();
    if (!isPreviewQuality(quality)) throw new RangeError('Invalid playback preview quality.');
    if (quality === this.previewQuality) return;
    this.previewQuality = quality;
    if (!this.composition || this.playbackState === 'idle' || this.playbackState === 'loading') return;
    const resume = this.playbackState === 'playing';
    this.pause();
    const targetTime = this.currentSeconds;
    const requestGeneration = ++this.generation;
    for (const pending of this.pendingLoads.values()) pending.resolve();
    this.pendingLoads.clear();
    const workerReady = new Promise<void>((resolve, reject) => {
      this.pendingLoads.set(requestGeneration, { resolve, reject });
    });
    try {
      this.post({ type: 'configure-preview', generation: requestGeneration, previewQuality: quality });
      await workerReady;
      if (requestGeneration !== this.generation) return;
      await this.seek(targetTime, 'seek');
      if (resume && quality === this.previewQuality) await this.play(targetTime);
    } finally {
      this.pendingLoads.delete(requestGeneration);
    }
  }

  dispose(): void {
    if (this.playbackState === 'disposed') return;
    this.stopClock();
    this.audio.dispose();
    this.post({ type: 'dispose' });
    this.workerDisposeTimer = setTimeout(() => this.terminateWorker(), WORKER_DISPOSE_TIMEOUT_MS);
    this.cache.clear();
    this.currentFrameKeys.clear();
    for (const pending of this.pendingSeeks.values()) pending.resolve('superseded');
    this.pendingSeeks.clear();
    for (const pending of this.pendingLoads.values()) pending.reject(new Error('Playback engine disposed.'));
    this.pendingLoads.clear();
    this.composition = null;
    this.durationSeconds = 0;
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
    if (message.type === 'disposed') {
      this.terminateWorker();
      return;
    }
    if (this.playbackState === 'disposed') {
      if (message.type === 'frame') message.bitmap.close();
      return;
    }
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
      this.emit('audio-metrics', this.audio.performanceMetrics);
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
    const key = `${this.previewQuality}:${message.clipId}:${message.timestampSeconds}`;
    const previousKey = this.currentFrameKeys.get(message.clipId);
    if (previousKey && !previousKey.startsWith(`${this.previewQuality}:`)) this.cache.delete(previousKey);
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

  private compositionDuration(composition: ClipComposition): number {
    return (
      composition.clips.reduce((end, clip) => Math.max(end, clip.timelineStartMs + clip.timelineDurationMs), 0) / 1_000
    );
  }

  private clampTime(value: number): number {
    if (!Number.isFinite(value)) throw new RangeError('Playback time must be finite.');
    return Math.max(0, Math.min(value, this.durationSeconds));
  }

  private post(message: PlaybackWorkerRequest) {
    this.worker.postMessage(message);
  }

  private terminateWorker() {
    if (this.workerTerminated) return;
    this.workerTerminated = true;
    if (this.workerDisposeTimer) clearTimeout(this.workerDisposeTimer);
    this.workerDisposeTimer = null;
    this.worker.terminate();
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
