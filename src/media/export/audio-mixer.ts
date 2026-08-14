import { AudioBufferSink } from 'mediabunny';
import {
  MediaInputError,
  isAudioClip,
  mediaSourceDescriptor,
  openMediaInput,
  type AudioClip,
  type ClipComposition,
  type OpenedMediaInput,
} from '../shared';

type AudioDecoder = { opened: OpenedMediaInput; sink: AudioBufferSink };

export async function mixCompositionAudio(
  composition: ClipComposition,
  durationSeconds: number,
  options: {
    sampleRate?: number;
    contextFactory?: (channels: number, frames: number, rate: number) => OfflineAudioContext;
  } = {},
): Promise<AudioBuffer | null> {
  const clips = composition.clips.filter((clip): clip is AudioClip => isAudioClip(clip) && clip.enabled);
  if (!clips.length) return null;
  const Context = globalThis.OfflineAudioContext;
  if (!options.contextFactory && !Context) throw new Error('Offline audio mixing is unavailable.');
  const sampleRate = options.sampleRate ?? 48_000;
  const context = options.contextFactory
    ? options.contextFactory(2, Math.max(1, Math.ceil(durationSeconds * sampleRate)), sampleRate)
    : new Context!(2, Math.max(1, Math.ceil(durationSeconds * sampleRate)), sampleRate);
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const decoders = new Map<string, AudioDecoder>();
  try {
    for (const assetId of new Set(clips.map((clip) => clip.assetId))) {
      const asset = assets.get(assetId);
      if (!asset) {
        throw new MediaInputError({
          kind: 'missing',
          sourceId: assetId,
          message: 'An audio clip references a missing media asset.',
        });
      }
      const descriptor = { ...mediaSourceDescriptor(asset), kind: 'audio' as const };
      const opened = await openMediaInput(descriptor);
      try {
        const track = await opened.input.getPrimaryAudioTrack();
        if (!track) throw missingAudio(assetId, 'The export source has no audio track.');
        if (!(await track.canDecode())) {
          throw new MediaInputError({
            kind: 'unsupported-codec',
            sourceId: assetId,
            track: 'audio',
            codec: await track.getCodec(),
            message: 'The export audio codec is unsupported by this device.',
          });
        }
        decoders.set(assetId, { opened, sink: new AudioBufferSink(track) });
      } catch (error) {
        opened.dispose();
        throw error;
      }
    }
    await Promise.all(clips.map((clip) => scheduleClip(context, clip, decoders.get(clip.assetId)!)));
    return await context.startRendering();
  } finally {
    for (const decoder of decoders.values()) decoder.opened.dispose();
  }
}

async function scheduleClip(context: OfflineAudioContext, clip: AudioClip, decoder: AudioDecoder): Promise<void> {
  const sourceStart = clip.sourceInMs / 1_000;
  const sourceEnd = (clip.sourceInMs + clip.sourceDurationMs) / 1_000;
  for await (const wrapped of decoder.sink.buffers(sourceStart, sourceEnd)) {
    const segmentStart = Math.max(sourceStart, wrapped.timestamp);
    const segmentEnd = Math.min(sourceEnd, wrapped.timestamp + wrapped.duration);
    if (segmentEnd <= segmentStart) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = wrapped.buffer;
    source.playbackRate.value = clip.playbackRate;
    gain.gain.value = Math.max(0, Math.min(2, clip.volume / 100));
    source.connect(gain).connect(context.destination);
    const timelineStart = clip.timelineStartMs / 1_000 + (segmentStart - sourceStart) / clip.playbackRate;
    source.start(timelineStart, segmentStart - wrapped.timestamp, segmentEnd - segmentStart);
  }
}

const missingAudio = (sourceId: string, message: string) =>
  new MediaInputError({ kind: 'missing-track', sourceId, track: 'audio', message });
