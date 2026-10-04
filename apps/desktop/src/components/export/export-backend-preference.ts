import type { PreferenceSettings } from '~/api/types/capture-api';

export function usesExperimentalLinuxFfmpeg(
  settings: Pick<PreferenceSettings, 'extras'> | null,
  platform: string,
): boolean {
  return platform === 'linux' && settings?.extras.videoExportBackend === 'ffmpeg-vaapi';
}
