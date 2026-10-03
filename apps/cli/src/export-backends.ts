import type { ExportBackendOptions } from './export-backend-types';
import type { CliRenderJob } from './render-job-types';

export function parseExportOptions(flags: string[]): ExportBackendOptions {
  const result: ExportBackendOptions = { backend: 'webcodecs', overwrite: false };
  let selected = false;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (flag === '--overwrite' && !result.overwrite) result.overwrite = true;
    else if (flag === '--backend' && !selected) {
      const backend = flags[++index];
      if (backend !== 'webcodecs' && backend !== 'ffmpeg-vaapi')
        throw new Error('Export backend must be webcodecs or ffmpeg-vaapi.');
      result.backend = backend;
      selected = true;
    } else throw new Error(`Unknown or repeated export option: ${flag}`);
  }
  return result;
}

export async function exportWithBackend(
  request: CliRenderJob,
  directory: string,
  destination: string,
  options: ExportBackendOptions,
) {
  if (options.backend === 'webcodecs') {
    const { exportInChromium } = await import('./chromium-export');
    return exportInChromium(request, directory, destination, options.overwrite);
  }
  if ('kind' in request) throw new Error('The experimental FFmpeg backend supports video exports only.');
  const { exportWithFfmpeg } = await import('./ffmpeg-export');
  return exportWithFfmpeg(request, directory, destination, options.overwrite);
}
