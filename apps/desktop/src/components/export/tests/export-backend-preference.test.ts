import { describe, expect, it } from 'vitest';
import { usesExperimentalLinuxFfmpeg } from '../export-backend-preference';

describe('desktop video export preference', () => {
  it('requires an explicit persisted selection on Linux', () => {
    expect(usesExperimentalLinuxFfmpeg({ extras: { videoExportBackend: 'ffmpeg-vaapi' } }, 'linux')).toBe(true);
    expect(usesExperimentalLinuxFfmpeg({ extras: { videoExportBackend: 'webcodecs' } }, 'linux')).toBe(false);
    expect(usesExperimentalLinuxFfmpeg({ extras: {} }, 'linux')).toBe(false);
    expect(usesExperimentalLinuxFfmpeg(null, 'linux')).toBe(false);
  });

  it.each([undefined, null, true, false, 1, '', 'FFmpeg', 'future-backend', {}, ['ffmpeg-vaapi']])(
    'does not activate native encoding for an unrecognized value (%j)',
    (videoExportBackend) => {
      expect(usesExperimentalLinuxFfmpeg({ extras: { videoExportBackend } }, 'linux')).toBe(false);
    },
  );

  it.each(['win32', 'darwin', 'unknown', ''])('ignores Linux-only preferences on %s', (platform) => {
    expect(usesExperimentalLinuxFfmpeg({ extras: { videoExportBackend: 'ffmpeg-vaapi' } }, platform)).toBe(false);
  });
});
