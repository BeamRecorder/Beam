import wallpaper from '../../../public/wallpapers/image/sequoia-blue.webp';
import brand from '../../../public/brand/BeamIcon.webp';
import recorder from '../../../public/icons/capture/beam-recorder.svg';
import screenshot from '../../../public/icons/capture/beam-screenshot.svg';
import instant from '../../../public/icons/capture/beam-instant.svg';

// Freeze the two public assets requested by the imported native components.
export function resolvePublicAssetUrl(path: string) {
  if (path === '/wallpapers/image/sequoia-blue.webp') return wallpaper;
  if (path === '/brand/BeamIcon.webp') return brand;
  if (path === '/icons/capture/beam-recorder.svg') return recorder;
  if (path === '/icons/capture/beam-screenshot.svg') return screenshot;
  if (path === '/icons/capture/beam-instant.svg') return instant;
  throw new Error(`Unbundled Recorder asset: ${path}`);
}
