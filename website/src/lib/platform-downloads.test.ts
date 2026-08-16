import { describe, expect, it } from 'vitest';
import type { GitHubReleaseAsset } from './platform-downloads';
import { assetForPlatform, detectPlatform, downloadSizeInMegabytes } from './platform-downloads';

const asset = (name: string): GitHubReleaseAsset => ({
  name,
  browser_download_url: `https://example.test/releases/${name}`,
  size: 1024 * 1024,
  content_type: 'application/octet-stream',
});

describe('detectPlatform', () => {
  it.each([
    [{ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)' }, 'macos'],
    [{ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'windows'],
    [{ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'linux'],
    [{ platform: 'Unknown', userAgent: 'Beam browser' }, null],
    [{ platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, null],
  ] as const)('maps %s to %s', (navigatorValue, expected) => {
    expect(detectPlatform(navigatorValue)).toBe(expected);
  });
});

describe('assetForPlatform', () => {
  const releaseAssets = [
    asset('Beam-Setup-0.1.5.exe.blockmap'),
    asset('Beam-0.1.5-arm64.dmg.blockmap'),
    asset('Beam-0.1.5-linux-x86_64.AppImage.blockmap'),
    asset('Beam-0.1.5-linux-x86_64.AppImage.engine'),
    asset('Beam-0.1.5-x64.dmg'),
    asset('Beam-0.1.5-linux-x86_64.AppImage'),
    asset('Beam-0.1.5-arm64.dmg'),
    asset('Beam-Setup-0.1.5.exe'),
  ] as const;

  it.each([
    ['windows', 'Beam-Setup-0.1.5.exe'],
    ['macos', 'Beam-0.1.5-arm64.dmg'],
    ['linux', 'Beam-0.1.5-linux-x86_64.AppImage'],
  ] as const)('selects the %s installer and ignores auxiliary assets', (platform, expectedName) => {
    expect(assetForPlatform(releaseAssets, platform)?.name).toBe(expectedName);
  });

  it('returns null when a platform installer is not published', () => {
    expect(assetForPlatform([asset('Beam-0.1.5-arm64.dmg')], 'windows')).toBeNull();
  });
});

describe('downloadSizeInMegabytes', () => {
  it.each([
    [0, null],
    [-1, null],
    [1024 * 1024, 1],
    [2.4 * 1024 * 1024, 2],
    [2.6 * 1024 * 1024, 3],
  ])('formats %s bytes as %s', (bytes, expected) => {
    expect(downloadSizeInMegabytes(bytes)).toBe(expected);
  });
});
