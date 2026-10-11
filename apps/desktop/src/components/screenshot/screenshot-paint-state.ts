import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
/** Crop editing shows the original media while zoom gestures paint their uncommitted geometry. */
export function screenshotPaintState(
  state: ScreenshotState,
  zoom: ZoomElement | null,
  cropping: boolean,
  selectedId?: string | null,
): ScreenshotState {
  const preview = zoom
    ? {
        ...state,
        zooms: state.zooms?.map((item) => (item.id === zoom.id ? { ...item, ...zoom, mode: 'manual' as const } : item)),
      }
    : state;
  if (!cropping) return preview;
  return {
    ...preview,
    image: selectedId === preview.image.id ? { ...preview.image, crop: undefined } : preview.image,
    images: preview.images?.map((image) => (image.id === selectedId ? { ...image, crop: undefined } : image)),
  };
}
