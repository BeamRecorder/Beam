import { describe, expect, it } from 'vitest';
import { playbackDecoderOptions, softwareAv1DecoderOptions } from '../playback-decoder';

describe('playback decoder policy', () => {
  it('uses buffered software AV1 decoding on Linux', () => {
    expect(playbackDecoderOptions('av1', 'Mozilla/5.0 (X11; Linux x86_64) Electron/44.5.1')).toEqual({
      hardwareAcceleration: 'prefer-software',
      optimizeForLatency: false,
    });
  });
  it.each(['Windows NT 10.0', 'Macintosh; Intel Mac OS X', ''])('retains hardware AV1 playback on %s', (platform) => {
    expect(playbackDecoderOptions('av1', platform)).toEqual({
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true,
    });
  });
  it.each(['avc', 'hevc', 'vp9', null])('retains existing Linux playback options for %s', (codec) => {
    expect(playbackDecoderOptions(codec, 'Linux')).toEqual({
      hardwareAcceleration: 'prefer-hardware',
      optimizeForLatency: true,
    });
  });
  it.each(['av1', 'av01.0.08M.08'])('selects the same software policy from codec names and parameters %s', (codec) => {
    expect(softwareAv1DecoderOptions(codec, 'Linux')).toEqual({
      hardwareAcceleration: 'prefer-software',
      optimizeForLatency: false,
    });
  });
  it.each(['avc1.640028', null])('leaves thumbnail decoder defaults alone for %s', (codec) => {
    expect(softwareAv1DecoderOptions(codec, 'Linux')).toBeUndefined();
  });
  it('leaves AV1 thumbnail decoder defaults alone outside Linux', () => {
    expect(softwareAv1DecoderOptions('av01.0.08M.08', 'Macintosh')).toBeUndefined();
  });
});
