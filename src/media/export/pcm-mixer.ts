import { AudioSample, AudioSampleSink, type InputAudioTrack } from 'mediabunny';
import type { AudioClip } from '../shared/composition-types';

export const EXPORT_AUDIO_RATE = 48_000;
export const EXPORT_AUDIO_CHANNELS = 2;
export const EXPORT_AUDIO_BLOCK_FRAMES = EXPORT_AUDIO_RATE;

type DecodedBlock = {
  start: number;
  end: number;
  rate: number;
  channels: Float32Array[];
};

export function stereoSample(channels: readonly Float32Array[], frame: number): [number, number] {
  const at = (channel: number) => channels[channel]?.[frame] ?? 0;
  if (channels.length === 1) return [at(0), at(0)];
  if (channels.length === 2) return [at(0), at(1)];
  if (channels.length === 4) return [(at(0) + at(2)) * 0.5, (at(1) + at(3)) * 0.5];
  if (channels.length >= 6) {
    const surround = Math.SQRT1_2;
    return [at(0) + surround * (at(2) + at(4)), at(1) + surround * (at(2) + at(5))];
  }
  return [at(0), at(1)];
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

  sampleAt(time: number): [number, number] {
    const block = this.blocks.find((entry) => time >= entry.start && time < entry.end);
    if (!block) return [0, 0];
    const position = Math.max(0, (time - block.start) * block.rate);
    const first = Math.min(block.channels[0]!.length - 1, Math.floor(position));
    const second = Math.min(block.channels[0]!.length - 1, first + 1);
    const fraction = position - first;
    const a = stereoSample(block.channels, first);
    const b = stereoSample(block.channels, second);
    return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  }

  discardBefore(sourceTime: number) {
    this.blocks = this.blocks.filter((block) => block.end >= sourceTime);
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
          for (let frame = 0; frame < frameCount; frame += 1) {
            const timeline = (startFrame + frame) / EXPORT_AUDIO_RATE;
            if (timeline < clipStart || timeline >= clipEnd) continue;
            const source = reader.clip.sourceInMs / 1_000 + (timeline - clipStart) * reader.clip.playbackRate;
            const [left, right] = reader.sampleAt(source);
            const gain = Math.max(0, Math.min(2, reader.clip.volume / 100));
            output[frame * 2] += left * gain;
            output[frame * 2 + 1] += right * gain;
          }
          const sourceStart =
            reader.clip.sourceInMs / 1_000 + (Math.max(blockStart, clipStart) - clipStart) * reader.clip.playbackRate;
          reader.discardBefore(sourceStart - 1 / EXPORT_AUDIO_RATE);
        }
        for (let index = 0; index < output.length; index += 1) output[index] = Math.max(-1, Math.min(1, output[index]!));
        return new AudioSample({
          data: output,
          format: 'f32',
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
