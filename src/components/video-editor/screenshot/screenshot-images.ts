import type { ScreenshotState } from '~/api/types/screenshot';
import type { MediaAsset } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { containedMediaRect } from '../canvas/output-canvas';
import type { ScreenshotImageLayer } from './screenshot-layer-types';

export const screenshotImage = (state: ScreenshotState, id: string | null) =>
  id === state.image.id ? state.image : state.images?.find((image) => image.id === id);

export function createScreenshotImage(
  asset: MediaAsset,
  width: number,
  height: number,
  canvas: ScreenshotState['canvas'],
): ScreenshotImageLayer {
  const fitted = containedMediaRect(width, height, canvas.width * 0.6, canvas.height * 0.6);
  return {
    id: crypto.randomUUID(),
    kind: 'image',
    name: asset.name,
    assetId: asset.id,
    source: asset.src,
    width,
    height,
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: {
      x: (1 - fitted.width / canvas.width) / 2,
      y: (1 - fitted.height / canvas.height) / 2,
      width: fitted.width / canvas.width,
      height: fitted.height / canvas.height,
    },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
  };
}
