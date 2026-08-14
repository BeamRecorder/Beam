import { AudioBufferSink, type WrappedAudioBuffer } from 'mediabunny';
import {
  MediaInputError,
  isAudioClip,
  mediaSourceDescriptor,
  openMediaInput,
  sourceTimeAt,
  type AudioClip,
  type ClipComposition,
  type MediaError,
  type OpenedMediaInput,
} from '../shared';

const SCHEDULE_AHEAD_SECONDS = 1;
const SCHEDULE_INTERVAL_MS = 100;

type AudioAssetDecoder = {
  opened: OpenedMediaInput;
  sink: AudioBufferSink;
};

type AudioConsumer = {
  clip: AudioClip;
  decoder: AudioAssetDecoder;
  iterator: AsyncIterator<WrappedAudioBuffer>;
  pending: WrappedAudioBuffer | null;
};

type ScheduledNode = { source: AudioBufferSourceNode; gain: GainNode };

export class AudioPlaybackScheduler {
  private composition: ClipComposition | null = null;
  private readonly decoders = new Map<string, AudioAssetDecoder>();
  private consumers: AudioConsumer[] = [];
  private readonly scheduled = new Set<ScheduledNode>();
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private schedulePromise: Promise<void> | null = null;
  private queuedScheduleGeneration: number | null = null;
  private generation = 0;
  private playing = false;
  private anchorTimelineSeconds = 0;
  private anchorContextSeconds = 0;
  private pausedTimelineSeconds = 0;
  private readonly onPlaybackError?: (error: MediaError) => void;

  constructor(onPlaybackError?: (error: MediaError) => void) {
    this.onPlaybackError = onPlaybackError;
  }

  async loadComposition(composition: ClipComposition): Promise<MediaError[]> {
    this.stopPlayback();
    this.disposeDecoders();
    this.composition = composition;
    const clips = composition.clips.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.enabled);
    const assetIds = new Set(clips.map((clip) => clip.assetId));
    const issues: MediaError[] = [];
    for (const assetId of assetIds) {
      let opened: OpenedMediaInput | null = null;
      try {
        const asset = composition.assets.find((entry) => entry.id === assetId);
        if (!asset) throw this.missingAsset(assetId);
        const descriptor = { ...mediaSourceDescriptor(asset), kind: 'audio' as const };
        opened = await openMediaInput(descriptor);
        const track = await opened.input.getPrimaryAudioTrack();
        if (!track) {
          throw new MediaInputError({
            kind: 'missing-track',
            sourceId: asset.id,
            track: 'audio',
            message: 'An audio clip references media without an audio track.',
          });
        }
        if (!(await track.canDecode())) {
          const codec = await track.getCodec();
          throw new MediaInputError({
            kind: 'unsupported-codec',
            sourceId: asset.id,
            track: 'audio',
            codec,
            message: 'The audio codec is unsupported by this device.',
          });
        }
        this.decoders.set(assetId, { opened, sink: new AudioBufferSink(track) });
        opened = null;
      } catch (error) {
        opened?.dispose();
        issues.push(this.mediaError(error, assetId));
      }
    }
    return issues;
  }

  async play(timelineSeconds: number, generation: number): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
    if (generation < this.generation) return;
    this.generation = generation;
    this.stopNodes();
    this.playing = true;
    this.anchorTimelineSeconds = timelineSeconds;
    this.pausedTimelineSeconds = timelineSeconds;
    this.anchorContextSeconds = context.currentTime;
    this.createConsumers(timelineSeconds);
    await this.requestSchedule(generation);
    if (!this.playing || generation !== this.generation) return;
    this.timer = setInterval(() => {
      void this.requestSchedule(generation).catch((error: unknown) => this.handleScheduleError(error, generation));
    }, SCHEDULE_INTERVAL_MS);
  }

  pause(timelineSeconds = this.currentTime()): void {
    this.pausedTimelineSeconds = timelineSeconds;
    this.playing = false;
    this.generation += 1;
    this.stopNodes();
    this.consumers = [];
  }

  async seek(timelineSeconds: number, generation: number, resume: boolean): Promise<void> {
    this.pausedTimelineSeconds = timelineSeconds;
    this.generation = generation;
    this.stopNodes();
    this.consumers = [];
    if (resume) await this.play(timelineSeconds, generation);
  }

  currentTime(): number {
    if (!this.playing || !this.context) return this.pausedTimelineSeconds;
    return this.anchorTimelineSeconds + (this.context.currentTime - this.anchorContextSeconds);
  }

  setVolume(percent: number): void {
    const value = Math.max(0, Math.min(1, percent / 100));
    const context = this.ensureContext();
    this.masterGain?.gain.setTargetAtTime(value, context.currentTime, 0.004);
  }

  dispose(): void {
    this.stopPlayback();
    this.disposeDecoders();
    this.masterGain?.disconnect();
    this.limiter?.disconnect();
    this.masterGain = null;
    this.limiter = null;
    void this.context?.close();
    this.context = null;
    this.composition = null;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.context.destination);
    return this.context;
  }

  private createConsumers(timelineSeconds: number) {
    const composition = this.composition;
    if (!composition) return;
    this.consumers = composition.clips
      .filter((clip): clip is AudioClip => isAudioClip(clip) && clip.enabled)
      .flatMap((clip) => {
        const decoder = this.decoders.get(clip.assetId);
        if (!decoder || timelineSeconds >= clip.timelineStartMs / 1_000 + clip.timelineDurationMs / 1_000) return [];
        const sourceStart = Math.max(
          clip.sourceInMs / 1_000,
          sourceTimeAt(clip, Math.max(clip.timelineStartMs, timelineSeconds * 1_000))! / 1_000,
        );
        const sourceEnd = (clip.sourceInMs + clip.sourceDurationMs) / 1_000;
        return [
          {
            clip,
            decoder,
            iterator: decoder.sink.buffers(sourceStart, sourceEnd)[Symbol.asyncIterator](),
            pending: null,
          },
        ];
      });
  }

  private async schedule(requestGeneration: number) {
    if (!this.playing || requestGeneration !== this.generation || !this.context) return;
    const horizon = this.currentTime() + SCHEDULE_AHEAD_SECONDS;
    await Promise.all(this.consumers.map((consumer) => this.scheduleConsumer(consumer, horizon, requestGeneration)));
  }

  private requestSchedule(requestGeneration: number): Promise<void> {
    this.queuedScheduleGeneration = requestGeneration;
    if (this.schedulePromise) return this.schedulePromise;
    const drain = async () => {
      while (this.queuedScheduleGeneration !== null) {
        const generation = this.queuedScheduleGeneration;
        this.queuedScheduleGeneration = null;
        await this.schedule(generation);
      }
    };
    const promise = drain().finally(() => {
      if (this.schedulePromise === promise) this.schedulePromise = null;
    });
    this.schedulePromise = promise;
    return promise;
  }

  private async scheduleConsumer(consumer: AudioConsumer, horizon: number, requestGeneration: number) {
    while (this.playing && requestGeneration === this.generation) {
      const wrapped = consumer.pending ?? (await consumer.iterator.next()).value ?? null;
      if (!this.playing || requestGeneration !== this.generation) return;
      consumer.pending = null;
      if (!wrapped) return;
      const clip = consumer.clip;
      const clipSourceStart = clip.sourceInMs / 1_000;
      const clipSourceEnd = (clip.sourceInMs + clip.sourceDurationMs) / 1_000;
      let segmentStart = Math.max(wrapped.timestamp, clipSourceStart);
      const segmentEnd = Math.min(wrapped.timestamp + wrapped.duration, clipSourceEnd);
      let timelineStart = clip.timelineStartMs / 1_000 + (segmentStart - clipSourceStart) / clip.playbackRate;
      if (timelineStart > horizon) {
        consumer.pending = wrapped;
        return;
      }
      if (segmentEnd <= segmentStart) continue;
      let when = this.anchorContextSeconds + (timelineStart - this.anchorTimelineSeconds);
      if (when < this.context!.currentTime) {
        segmentStart += (this.context!.currentTime - when) * clip.playbackRate;
        timelineStart = clip.timelineStartMs / 1_000 + (segmentStart - clipSourceStart) / clip.playbackRate;
        when = this.anchorContextSeconds + (timelineStart - this.anchorTimelineSeconds);
      }
      if (segmentEnd <= segmentStart) continue;
      this.startNode(consumer, wrapped, segmentStart, segmentEnd, Math.max(this.context!.currentTime, when));
    }
  }

  private startNode(
    consumer: AudioConsumer,
    wrapped: WrappedAudioBuffer,
    segmentStart: number,
    segmentEnd: number,
    when: number,
  ) {
    const context = this.context!;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = wrapped.buffer;
    source.playbackRate.value = consumer.clip.playbackRate;
    gain.gain.value = Math.max(0, Math.min(2, consumer.clip.volume / 100));
    source.connect(gain);
    gain.connect(this.masterGain!);
    const node = { source, gain };
    this.scheduled.add(node);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.scheduled.delete(node);
    };
    source.start(when, segmentStart - wrapped.timestamp, segmentEnd - segmentStart);
  }

  private stopPlayback() {
    this.playing = false;
    this.generation += 1;
    this.stopNodes();
    this.consumers = [];
  }

  private stopNodes() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queuedScheduleGeneration = null;
    for (const node of this.scheduled) {
      try {
        node.source.stop();
      } catch {
        // Already-ended nodes still need to be disconnected.
      }
      node.source.disconnect();
      node.gain.disconnect();
    }
    this.scheduled.clear();
  }

  private disposeDecoders() {
    for (const decoder of this.decoders.values()) decoder.opened.dispose();
    this.decoders.clear();
  }

  private missingAsset(assetId: string) {
    return new MediaInputError({
      kind: 'missing',
      sourceId: assetId,
      message: 'An audio clip references a missing media asset.',
    });
  }

  private mediaError(error: unknown, sourceId: string): MediaError {
    return error instanceof MediaInputError
      ? error.detail
      : {
          kind: 'decode-failure',
          sourceId,
          message: error instanceof Error ? error.message : 'Audio playback failed.',
        };
  }

  private handleScheduleError(error: unknown, requestGeneration: number) {
    if (!this.playing || requestGeneration !== this.generation) return;
    const detail = this.mediaError(error, 'audio-playback');
    this.stopPlayback();
    if (this.onPlaybackError) this.onPlaybackError(detail);
    else console.error('[Beam media:audio] Audio scheduling failed.', detail);
  }
}

export { SCHEDULE_AHEAD_SECONDS };
