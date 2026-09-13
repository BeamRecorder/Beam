import { drawScreenshotLayer } from './screenshot-layer-render';
import { screenshotLayers } from './screenshot-layers';
import { loadScreenshotCursors } from './screenshot-cursors';
import { BUILTIN_CURSOR_PACKS } from '../properties/cursor/cursor-packs';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import { releaseCompositedLayerSurface, renderCompositedLayer } from '../composition/render-composited-layer';
import { loadElementFonts } from '~/media/shared/element-fonts';
import { i18n } from '~/i18n';
import { validScreenshotDimensions } from './screenshot-dimensions';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { Canvas2DContext } from '~/types/canvas';
import { WATERMARK_LOGO_PATH } from '../canvas/watermark-render';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { ScreenshotEncodeOptions, ScreenshotRenderAssets } from './screenshot-types';
import { createScreenshotImageLoader } from './screenshot-assets';

export async function loadScreenshotAssets(
  source: string,
  state: ScreenshotState,
  packs?: readonly CursorPackDescriptor[],
  load = createScreenshotImageLoader(),
): Promise<ScreenshotRenderAssets> {
  const loadCursors = async () => {
    if (!state.cursors?.some((cursor) => cursor.enabled)) return undefined;
    const library = packs ?? [
      ...BUILTIN_CURSOR_PACKS,
      ...(await (await import('~/api/capture')).capture.listCursorPacks()),
    ];
    return loadScreenshotCursors(state.cursors, library, state.canvas);
  };
  const background = state.canvas.showBackground ? state.background : null;
  if (background && background.kind === 'video') throw new Error(i18n.global.t('ScreenshotEditor.backgroundError'));
  const [image, backdrop, logo, cursors, images] = await Promise.all([
    load(source),
    background?.kind === 'image' ? load(background.path) : null,
    state.canvas.watermark?.enabled && state.canvas.watermark.showLogo
      ? load(resolvePublicAssetUrl(WATERMARK_LOGO_PATH))
      : null,
    loadCursors(),
    Promise.all(
      (state.images ?? []).map(async (layer) => {
        const image = await load(layer.source);
        return [layer.id, { image, width: image.naturalWidth, height: image.naturalHeight }] as const;
      }),
    ),
    loadElementFonts(state.shapes),
  ]);
  return {
    image,
    background: backdrop,
    logo,
    width: image.naturalWidth,
    height: image.naturalHeight,
    ...(cursors ? { cursors } : {}),
    ...(images.length ? { images: new Map(images) } : {}),
  };
}

export function drawScreenshot(
  ctx: Canvas2DContext,
  state: ScreenshotState,
  assets: ScreenshotRenderAssets,
  width: number,
  height: number,
  editingId?: string,
) {
  ctx.clearRect(0, 0, width, height);
  for (const layer of screenshotLayers(state)) {
    if (!layer.visible) continue;
    renderCompositedLayer(ctx, layer, width, height, (target, backdrop) => {
      drawScreenshotLayer(target, state, layer, assets, width, height, backdrop, editingId);
    });
  }
}

export async function encodeScreenshot(
  source: string,
  state: ScreenshotState,
  options: ScreenshotEncodeOptions = {},
): Promise<ArrayBuffer> {
  const { width, height } = state.canvas;
  if (!validScreenshotDimensions(state.canvas)) throw new Error(i18n.global.t('ScreenshotEditor.dimensionsError'));
  const assets = await loadScreenshotAssets(source, state);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  try {
    if (!ctx) throw new Error(i18n.global.t('ScreenshotEditor.renderUnavailable'));
    drawScreenshot(ctx, state, assets, width, height);
    await options.onRendered?.(canvas);
    const type = `image/${state.format}`;
    const blob = await canvas.convertToBlob({ type, quality: Math.max(0, Math.min(1, state.quality)) });
    if (blob.type !== type)
      throw new Error(i18n.global.t('ScreenshotEditor.encodingUnavailable', { format: state.format.toUpperCase() }));
    return blob.arrayBuffer();
  } finally {
    if (ctx) releaseCompositedLayerSurface(ctx);
    // The encoded blob owns its pixels. Do not retain a full-size render target
    // while IPC, native decoding or a save dialog is pending.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function screenshotPreview(source: OffscreenCanvas): Promise<string> {
  const scale = Math.min(1, 184 / source.width, 104 / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const preview = new OffscreenCanvas(width, height);
  const ctx = preview.getContext('2d');
  if (!ctx) throw new Error(i18n.global.t('ScreenshotEditor.renderUnavailable'));
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await preview.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:image/jpeg;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
}
