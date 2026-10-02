import type { PlaybackDecoderOptions } from './playback-types';

export function softwareLinuxDecoderOptions(
  codec: string | null,
  userAgent: string,
): PlaybackDecoderOptions | undefined {
  // Linux VA-API can advertise AV1/VP9 support but fail during decode/flush.
  // Select Chromium's buffered software decoder for these codecs consistently.
  const softwareCodec = codec === 'av1' || codec?.startsWith('av01.') || codec === 'vp9' || codec?.startsWith('vp09.');
  if (softwareCodec && userAgent.includes('Linux'))
    return { hardwareAcceleration: 'prefer-software', optimizeForLatency: false };
  return undefined;
}

export function playbackDecoderOptions(codec: string | null, userAgent: string): PlaybackDecoderOptions {
  const software = softwareLinuxDecoderOptions(codec, userAgent);
  if (software) return software;
  return { hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true };
}
