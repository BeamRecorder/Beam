import { describe, expect, it } from 'vitest';
import { estimatedExportBytes, EXPORT_AUDIO_BITRATE } from './export-estimate';
import { bitrateFor } from './export-presets';

const input = { width: 1920, height: 1080, fps: 30, duration: 10, preset: 'medium' as const, includeAudio: false };

describe('export size estimate', () => {
  it('uses the same target video bitrate as the encoder', () => {
    expect(estimatedExportBytes(input)).toBe(Math.ceil((bitrateFor('medium', 1920, 1080, 30) * 10) / 8));
  });
  it('includes selected audio at the actual encoder target bitrate', () => {
    expect(estimatedExportBytes({ ...input, includeAudio: true })! - estimatedExportBytes(input)!).toBe(
      (EXPORT_AUDIO_BITRATE * 10) / 8,
    );
  });
  it('responds to quality, resolution, frame rate and a trimmed export duration', () => {
    const original = estimatedExportBytes(input)!;
    for (const patch of [{ preset: 'low' as const }, { width: 1280, height: 720 }, { fps: 24 }, { duration: 5 }])
      expect(estimatedExportBytes({ ...input, ...patch })).toBeLessThan(original);
    expect(estimatedExportBytes({ ...input, preset: 'high' })).toBeGreaterThan(original);
  });
  it.each(['duration', 'width', 'height', 'fps'] as const)('rejects invalid %s', (key) => {
    for (const value of [0, -1, NaN, Infinity]) expect(estimatedExportBytes({ ...input, [key]: value })).toBeNull();
  });
  it('honors encoder bitrate limits and does not return an overflowing estimate', () => {
    expect(estimatedExportBytes({ ...input, width: 1, height: 1 })).toBe((500_000 * 10) / 8);
    expect(estimatedExportBytes({ ...input, width: 16000, height: 16000 })).toBe((40_000_000 * 10) / 8);
    expect(estimatedExportBytes({ ...input, duration: Number.MAX_VALUE })).toBeNull();
  });
});
