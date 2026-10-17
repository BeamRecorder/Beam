import type { AudioBufferSink, WrappedAudioBuffer } from 'mediabunny';
import type { AudioClip, OpenedMediaInput } from '@beam/runtime/shared/index';

export interface AudioAssetDecoder {
  opened: OpenedMediaInput;
  sink: AudioBufferSink;
}

export interface AudioConsumer {
  clip: AudioClip;
  decoder: AudioAssetDecoder;
  sourceStart: number;
  sourceEnd: number;
  iterator: AsyncIterator<WrappedAudioBuffer> | null;
  pending: WrappedAudioBuffer | null;
  ended: boolean;
}

export interface ScheduledAudioNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
}
