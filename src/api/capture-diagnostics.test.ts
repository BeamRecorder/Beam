import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaptureCatalog, LinuxCaptureDiagnostics } from './types/capture-api';
import { latestCaptureCatalog, rememberCaptureCatalog, unavailableLinuxRequirements } from './capture-diagnostics';

const diagnostics = (recordingAvailable = true): LinuxCaptureDiagnostics => ({
  distribution: 'Debian GNU/Linux 13',
  distributionId: 'debian',
  distributionLike: [],
  distributionVersion: '13',
  kernel: '6.12.0-amd64',
  architecture: 'x86_64',
  desktop: 'GNOME',
  sessionType: 'x11',
  displayServer: 'X11',
  backend: 'xdg-portal-pipewire',
  portal: {
    available: true,
    errorCode: null,
    detail: null,
    version: 5,
    monitor: true,
    window: true,
    metadataCursor: true,
  },
  pipewire: {
    available: false,
    errorCode: 'pipewire-connect-failed',
    detail: null,
  },
  ffmpeg: {
    available: recordingAvailable,
    errorCode: recordingAvailable ? null : 'ffmpeg-unavailable',
    detail: recordingAvailable ? null : 'FFmpeg does not provide the MP4 muxer required by Beam',
    encoder: recordingAvailable ? 'libx264' : null,
    codec: recordingAvailable ? 'h264' : null,
    hardware: false,
  },
  recordingAvailable,
});

const catalog = (linux: LinuxCaptureDiagnostics): CaptureCatalog => ({
  sources: [],
  capabilities: {},
  diagnostics: { platform: 'linux', linux },
});

beforeEach(() => rememberCaptureCatalog(null));
afterEach(() => rememberCaptureCatalog(null));

describe('capture diagnostics cache', () => {
  it('starts empty and returns the latest remembered catalog', () => {
    expect(latestCaptureCatalog()).toBeNull();
    const next = catalog(diagnostics());

    rememberCaptureCatalog(next);

    expect(latestCaptureCatalog()).toBe(next);
  });

  it('replaces stale diagnostics and supports clearing the cache', () => {
    const first = catalog(diagnostics());
    const second = catalog(diagnostics(false));
    rememberCaptureCatalog(first);
    rememberCaptureCatalog(second);
    expect(latestCaptureCatalog()).toBe(second);

    rememberCaptureCatalog(null);

    expect(latestCaptureCatalog()).toBeNull();
  });
});

describe('unavailableLinuxRequirements', () => {
  it('returns no issues when diagnostics are absent or recording is available', () => {
    expect(unavailableLinuxRequirements()).toEqual([]);
    expect(unavailableLinuxRequirements(diagnostics())).toEqual([]);
  });

  it('returns details first and error codes when requirements are unavailable', () => {
    expect(unavailableLinuxRequirements(diagnostics(false))).toEqual([
      'pipewire-connect-failed',
      'FFmpeg does not provide the MP4 muxer required by Beam',
    ]);
  });

  it('uses a stable fallback when an unavailable requirement has no detail or code', () => {
    const broken = diagnostics(false);
    broken.pipewire.errorCode = null;

    expect(unavailableLinuxRequirements(broken)).toEqual([
      'Unknown Linux capture requirement failure',
      'FFmpeg does not provide the MP4 muxer required by Beam',
    ]);
  });
});
