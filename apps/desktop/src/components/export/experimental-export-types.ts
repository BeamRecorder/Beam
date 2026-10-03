import type { ExportRequest } from '@beam/encoder/export-types';

export type DesktopVideoExportBackend = 'webcodecs' | 'ffmpeg-vaapi';

export interface DesktopExportRequest extends ExportRequest {
  experimentalLinuxFfmpeg?: boolean;
}
