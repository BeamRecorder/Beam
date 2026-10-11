import recorder from "../../../public/icons/capture/beam-recorder.svg";
import screenshot from "../../../public/icons/capture/beam-screenshot.svg";
import instant from "../../../public/icons/capture/beam-instant.svg";
import wallpaper from '../../../public/wallpapers/image/sequoia-blue.webp';
import beam from '../../../public/brand/BeamIcon.webp';
import { resolvePublicAssetUrl as nativeAssetUrl } from "../../../apps/desktop/src/utils/public-asset";
// Freeze the real capture icons into the portable composition bundle.
const icons: Record<string, string> = {
  "/icons/capture/beam-recorder.svg": recorder,
  "/icons/capture/beam-screenshot.svg": screenshot,
  "/icons/capture/beam-instant.svg": instant,
  '/wallpapers/image/sequoia-blue.webp': wallpaper,
  '/brand/BeamIcon.webp': beam,
};
export function resolvePublicAssetUrl(path: string) {
  return icons[path] ?? nativeAssetUrl(path);
}
