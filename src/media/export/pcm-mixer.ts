import { AudioSample, AudioSampleSink, type InputAudioTrack } from 'mediabunny';
import type { AudioClip } from '../shared/composition-types';
import { audioTransitionGainAt } from '../shared/clip-transitions';
import { effectiveAudioClipGain } from '../shared/audio-gain';
import { StreamingAudioLimiter } from '../shared/audio-limiter';

export const EXPORT_AUDIO_RATE = 48_000;
export const EXPORT_AUDIO_CHANNELS = 2;
export const EXPORT_AUDIO_BLOCK_FRAMES = EXPORT_AUDIO_RATE;

type DecodedBlock = {
  start: number;
  end: number;
  rate: number;
  channels: Float32Array[];
};

const stereoChannel = (channels: readonly Float32Array[], frame: number, right: boolean) => {
  if (channels.length === 1) return channels[0]?.[frame] ?? 0;
  if (channels.length === 2) return channels[right ? 1 : 0]?.[frame] ?? 0;
  if (channels.length === 4)
    return ((channels[right ? 1 : 0]?.[frame] ?? 0) + (channels[right ? 3 : 2]?.[frame] ?? 0)) * 0.5;
  if (channels.length >= 6) {
    const surround = Math.SQRT1_2;
    const front = channels[right ? 1 : 0]?.[frame] ?? 0;
    const center = channels[2]?.[frame] ?? 0;
    const rear = channels[right ? 5 : 4]?.[frame] ?? 0;
    return front + surround * (center + rear);
  }
  return channels[right ? 1 : 0]?.[frame] ?? 0;
};

export function stereoSample(channels: readonly Float32Array[], frame: number): [number, number] {
  return [stereoChannel(channels, frame, false), stereoChannel(channels, frame, true)];
}

class ClipPcmReader {
  readonly clip: AudioClip;
  private readonly iterator: AsyncIterator<import('mediabunny').AudioSample>;
  private blocks: DecodedBlock[] = [];
  private ended = false;
  private closed = false;

  constructor(clip: AudioClip, track: InputAudioTrack) {
    this.clip = clip;
    this.iterator = new AudioSampleSink(track)
      .samples(clip.sourceInMs / 1_000, (clip.sourceInMs + clip.sourceDurationMs) / 1_000, {
        skipLiveWait: true,
      })
      [Symbol.asyncIterator]();
  }

  async prepare(sourceEnd: number, signal: AbortSignal) {
    while (!this.ended && (this.blocks.at(-1)?.end ?? -Infinity) < sourceEnd) {
      if (signal.aborted) throw new DOMException('Audio mixing cancelled.', 'AbortError');
      const next = await this.iterator.next();
      if (next.done) {
        this.ended = true;
        break;
      }
      const sample = next.value;
      if (signal.aborted) {
        sample.close();
        throw new DOMException('Audio mixing cancelled.', 'AbortError');
      }
      try {
        const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const data = new Float32Array(sample.numberOfFrames);
          sample.copyTo(data, { planeIndex, format: 'f32-planar' });
          return data;
        });
        this.blocks.push({
          start: sample.timestamp,
          end: sample.timestamp + sample.duration,
          rate: sample.sampleRate,
          channels,
        });
      } finally {
        sample.close();
      }
    }
  }

  mixInto(output: Float32Array, startFrame: number, frameCount: number) {
    const clipStart = this.clip.timelineStartMs / 1_000;
    const clipEnd = clipStart + this.clip.timelineDurationMs / 1_000;
    const firstFrame = Math.max(startFrame, Math.ceil(clipStart * EXPORT_AUDIO_RATE));
    const lastFrame = Math.min(startFrame + frameCount, Math.ceil(clipEnd * EXPORT_AUDIO_RATE));
    const gain = effectiveAudioClipGain(this.clip);
    let blockIndex = 0;
    for (let timelineFrame = firstFrame; timelineFrame < lastFrame; timelineFrame += 1) {
      const sourceTime =
        this.clip.sourceInMs / 1_000 + (timelineFrame / EXPORT_AUDIO_RATE - clipStart) * this.clip.playbackRate;
      while (blockIndex < this.blocks.length && sourceTime >= this.blocks[blockIndex]!.end) blockIndex += 1;
      const block = this.blocks[blockIndex];
      if (!block || sourceTime < block.start) continue;
      const position = Math.max(0, (sourceTime - block.start) * block.rate);
      const length = block.channels[0]!.length;
      const first = Math.min(length - 1, Math.floor(position));
      const second = Math.min(length - 1, first + 1);
      const fraction = position - first;
      const left = stereoChannel(block.channels, first, false);
      const right = stereoChannel(block.channels, first, true);
      const nextLeft = stereoChannel(block.channels, second, false);
      const nextRight = stereoChannel(block.channels, second, true);
      const outputFrame = timelineFrame - startFrame;
      const envelope = audioTransitionGainAt(this.clip, (timelineFrame / EXPORT_AUDIO_RATE) * 1_000);
      output[outputFrame * 2] += (left + (nextLeft - left) * fraction) * gain * envelope;
      output[outputFrame * 2 + 1] += (right + (nextRight - right) * fraction) * gain * envelope;
    }
  }

  discardBefore(sourceTime: number) {
    const firstUseful = this.blocks.findIndex((block) => block.end >= sourceTime);
    if (firstUseful === -1) this.blocks = [];
    else if (firstUseful > 0) this.blocks.splice(0, firstUseful);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.ended = true;
    this.blocks = [];
    await this.iterator.return?.();
  }
}

export type ProgressiveAudioMixer = {
  readonly blockCount: number;
  mixBlock(index: number, signal: AbortSignal): Promise<AudioSample>;
  dispose(): Promise<void>;
};

export function createProgressiveAudioMixer(
  clips: readonly AudioClip[],
  tracks: ReadonlyMap<string, InputAudioTrack>,
  durationSeconds: number,
): ProgressiveAudioMixer {
  const readers = clips.map((clip) => {
    const track = tracks.get(clip.assetId);
    if (!track) throw new Error(`Audio track unavailable for ${clip.name}.`);
    return new ClipPcmReader(clip, track);
  });
  const blockCount = Math.ceil((durationSeconds * EXPORT_AUDIO_RATE) / EXPORT_AUDIO_BLOCK_FRAMES);
  const limiter = new StreamingAudioLimiter();
  let previousBlock = -1;
  const dispose = async () => {
    await Promise.allSettled(readers.map((reader) => reader.close()));
  };
  return {
    blockCount,
    async mixBlock(index, signal) {
      try {
        if (!Number.isInteger(index) || index < 0 || index >= blockCount) throw new RangeError('Invalid audio block.');
        const startFrame = index * EXPORT_AUDIO_BLOCK_FRAMES;
        const frameCount = Math.min(
          EXPORT_AUDIO_BLOCK_FRAMES,
          Math.ceil(durationSeconds * EXPORT_AUDIO_RATE) - startFrame,
        );
        const output = new Float32Array(frameCount * EXPORT_AUDIO_CHANNELS);
        const blockStart = startFrame / EXPORT_AUDIO_RATE;
        const blockEnd = (startFrame + frameCount) / EXPORT_AUDIO_RATE;
        for (const reader of readers) {
          const clipStart = reader.clip.timelineStartMs / 1_000;
          const clipEnd = clipStart + reader.clip.timelineDurationMs / 1_000;
          if (clipEnd <= blockStart || clipStart >= blockEnd) continue;
          const activeEnd = Math.min(blockEnd, clipEnd);
          const sourceEnd = reader.clip.sourceInMs / 1_000 + (activeEnd - clipStart) * reader.clip.playbackRate;
          await reader.prepare(sourceEnd + 1 / EXPORT_AUDIO_RATE, signal);
          reader.mixInto(output, startFrame, frameCount);
          const sourceStart =
            reader.clip.sourceInMs / 1_000 + (Math.max(blockStart, clipStart) - clipStart) * reader.clip.playbackRate;
          reader.discardBefore(sourceStart - 1 / EXPORT_AUDIO_RATE);
        }
        if (index !== previousBlock + 1) limiter.reset();
        limiter.processInterleaved(output, EXPORT_AUDIO_CHANNELS, EXPORT_AUDIO_RATE);
        previousBlock = index;
        const planarOutput = new Float32Array(output.length);
        for (let frame = 0; frame < frameCount; frame += 1) {
          planarOutput[frame] = output[frame * EXPORT_AUDIO_CHANNELS]!;
          planarOutput[frameCount + frame] = output[frame * EXPORT_AUDIO_CHANNELS + 1]!;
        }
        return new AudioSample({
          data: planarOutput,
          format: 'f32-planar',
          numberOfChannels: EXPORT_AUDIO_CHANNELS,
          sampleRate: EXPORT_AUDIO_RATE,
          timestamp: blockStart,
        });
      } catch (error) {
        await dispose();
        throw error;
      }
    },
    dispose,
  };
}
