export type WebsitePlatform = 'windows' | 'macos' | 'linux';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
}

export const PLATFORM_DETAILS: Record<WebsitePlatform, { label: string; shortLabel: string; icon: string }> = {
  windows: {
    label: 'Windows',
    shortLabel: 'Windows',
    icon: '/os/windows.svg',
  },
  macos: {
    label: 'macOS',
    shortLabel: 'Mac',
    icon: '/os/apple.svg',
  },
  linux: {
    label: 'Linux',
    shortLabel: 'Linux',
    icon: '/os/linux.svg',
  },
};

export const detectPlatform = (navigatorValue: Pick<Navigator, 'platform' | 'userAgent'>): WebsitePlatform | null => {
  const value = `${navigatorValue.platform} ${navigatorValue.userAgent}`.toLowerCase();
  if (/iphone|ipad|android/.test(value)) return null;
  if (value.includes('mac')) return 'macos';
  if (value.includes('win')) return 'windows';
  if (value.includes('linux') || value.includes('x11')) return 'linux';
  return null;
};

export const assetForPlatform = (
  assets: readonly GitHubReleaseAsset[],
  platform: WebsitePlatform,
): GitHubReleaseAsset | null => {
  const pattern =
    platform === 'windows'
      ? /^Beam-Setup-.*\.exe$/i
      : platform === 'macos'
        ? /^Beam-.*-arm64\.dmg$/i
        : /^Beam-.*-linux-x86_64\.AppImage$/i;
  return assets.find((asset) => pattern.test(asset.name)) ?? null;
};

export const downloadSizeInMegabytes = (bytes: number) => (bytes > 0 ? Math.round(bytes / (1024 * 1024)) : null);
