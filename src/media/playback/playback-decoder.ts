import type { PlaybackDecoderOptions } from './playback-types';

export function softwareAv1DecoderOptions(codec: string | null, userAgent: string): PlaybackDecoderOptions | undefined {
  // Linux AV1 hardware support can be advertised while frame decoding/flush
  // fails. Use Chromium's AV1 software decoder for editor playback there.
  if ((codec === 'av1' || codec?.startsWith('av01.')) && userAgent.includes('Linux'))
    return { hardwareAcceleration: 'prefer-software', optimizeForLatency: false };
  return undefined;
}

export function playbackDecoderOptions(codec: string | null, userAgent: string): PlaybackDecoderOptions {
  const software = softwareAv1DecoderOptions(codec, userAgent);
  if (software) return software;
  return { hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true };
}
