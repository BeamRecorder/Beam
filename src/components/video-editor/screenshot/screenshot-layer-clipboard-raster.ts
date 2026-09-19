import type { ScreenshotState } from '~/api/types/screenshot';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { WATERMARK_LOGO_PATH } from '../canvas/watermark-render';
import { alphaBounds } from './composition/thumbnails/thumbnail-pixels';
import { createScreenshotImageLoader } from './screenshot-assets';
import { drawScreenshotLayer } from './screenshot-layer-render';
import type { ScreenshotImageLayer } from './screenshot-layer-types';
import { SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID, screenshotLayers } from './screenshot-layers';

const MAX_RASTER_DIMENSION = 1_400;

const dataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return `data:${blob.type};base64,${btoa(binary)}`;
};

const neutralAppearance = () => ({
  ...createDefaultClipAppearance('image'),
  cornerRadius: 'none' as const,
  shadowSize: 'none' as const,
  shadowBlur: 0,
});

export async function rasterizeScreenshotLayer(
  state: ScreenshotState,
  id: typeof SCREENSHOT_BACKGROUND_ID | typeof SCREENSHOT_WATERMARK_ID,
  name: string,
  load = createScreenshotImageLoader(),
): Promise<ScreenshotImageLayer> {
  const layer = screenshotLayers(state).find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`Screenshot layer unavailable: ${id}`);
  const scale = Math.min(1, MAX_RASTER_DIMENSION / Math.max(state.canvas.width, state.canvas.height));
  const width = Math.max(1, Math.round(state.canvas.width * scale));
  const height = Math.max(1, Math.round(state.canvas.height * scale));
  const surface = new OffscreenCanvas(width, height);
  const context = surface.getContext('2d', { willReadFrequently: id === SCREENSHOT_WATERMARK_ID });
  if (!context) throw new Error('Screenshot layer rendering is unavailable.');
  let output: OffscreenCanvas | null = null;
  try {
    const background =
      id === SCREENSHOT_BACKGROUND_ID && state.background?.kind === 'image' ? await load(state.background.path) : null;
    const watermark = state.canvas.watermark;
    const logo =
      id === SCREENSHOT_WATERMARK_ID && watermark?.showLogo
        ? await load(resolvePublicAssetUrl(WATERMARK_LOGO_PATH))
        : null;
    const visibleState =
      id === SCREENSHOT_WATERMARK_ID
        ? {
            ...state,
            canvas: {
              ...state.canvas,
              watermark: watermark ? { ...watermark, enabled: true } : undefined,
            },
          }
        : state;
    drawScreenshotLayer(context, visibleState, layer, { background, logo }, width, height);

    const bounds =
      id === SCREENSHOT_WATERMARK_ID
        ? alphaBounds(context.getImageData(0, 0, width, height).data, width, height)
        : { x: 0, y: 0, width, height };
    if (!bounds) throw new Error('Screenshot layer has no visible pixels.');
    output = new OffscreenCanvas(bounds.width, bounds.height);
    const outputContext = output.getContext('2d');
    if (!outputContext) throw new Error('Screenshot layer encoding is unavailable.');
    outputContext.drawImage(
      surface,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    const blob = await output.convertToBlob({ type: 'image/webp', quality: 0.85 });
    return {
      id,
      kind: 'image',
      name,
      assetId: id,
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      enabled: layer.visible,
      order: 0,
      transform: {
        x: bounds.x / width,
        y: bounds.y / height,
        width: bounds.width / width,
        height: bounds.height / height,
      },
      appearance: neutralAppearance(),
      isMirrored: false,
      isMirroredY: false,
      cameraFramingPreset: 'fit',
      source: await dataUrl(blob),
      width: bounds.width,
      height: bounds.height,
    };
  } finally {
    surface.width = 0;
    surface.height = 0;
    if (output) {
      output.width = 0;
      output.height = 0;
    }
  }
}
