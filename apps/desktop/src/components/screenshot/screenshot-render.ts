import { loadScreenshotCursors } from '@beam/runtime/screenshot/screenshot-cursors';
import { prepareScreenshotAssets } from '@beam/runtime/screenshot/screenshot-assets';
import { encodeStillImage } from '@beam/encoder/still-encoder';
import { StillEncodingError } from '@beam/encoder/still-encoding-error';
import { projectFontSource } from '~/api/project-font-source';
import { BUILTIN_CURSOR_PACKS } from '../editor/properties/cursor/cursor-packs';
import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
import { i18n } from '~/i18n';
import { validScreenshotDimensions } from '@beam/engine/screenshot/screenshot-dimensions';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import { WATERMARK_LOGO_PATH } from '@beam/runtime/rendering/watermark-render';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { ScreenshotEncodeOptions } from './screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import { createScreenshotImageLoader } from '@beam/runtime/screenshot/screenshot-image-loader';

export async function loadScreenshotAssets(
  source: string,
  state: ScreenshotState,
  packs?: readonly CursorPackDescriptor[],
  load = createScreenshotImageLoader(),
): Promise<ScreenshotRenderAssets> {
  if (state.canvas.showBackground && state.background?.kind === 'video')
    throw new Error(i18n.global.t('ScreenshotEditor.backgroundError'));
  const cursorPacks = state.cursors?.some((cursor) => cursor.enabled)
    ? (packs ?? [...BUILTIN_CURSOR_PACKS, ...(await (await import('~/api/capture')).capture.listCursorPacks())])
    : [];
  return prepareScreenshotAssets(source, state, {
    loadImage: load,
    fontSource: projectFontSource,
    cursorPacks,
    watermarkSource: resolvePublicAssetUrl(WATERMARK_LOGO_PATH),
  });
}

export async function loadScreenshotDecorations(
  state: ScreenshotState,
  packs?: readonly CursorPackDescriptor[],
  load = createScreenshotImageLoader(),
) {
  const cursorPacks = state.cursors?.some((cursor) => cursor.enabled)
    ? (packs ?? [...BUILTIN_CURSOR_PACKS, ...(await (await import('~/api/capture')).capture.listCursorPacks())])
    : [];
  const [logo, cursors] = await Promise.all([
    state.canvas.watermark?.enabled && state.canvas.watermark.showLogo
      ? load(resolvePublicAssetUrl(WATERMARK_LOGO_PATH))
      : null,
    state.cursors?.some((cursor) => cursor.enabled)
      ? loadScreenshotCursors(state.cursors, cursorPacks, state.canvas)
      : undefined,
  ]);
  return { logo, ...(cursors ? { cursors } : {}) };
}

export async function encodeScreenshot(
  source: string,
  state: ScreenshotState,
  options: ScreenshotEncodeOptions = {},
): Promise<ArrayBuffer> {
  if (!validScreenshotDimensions(state.canvas)) throw new Error(i18n.global.t('ScreenshotEditor.dimensionsError'));
  const assets = await loadScreenshotAssets(source, state);
  try {
    return await encodeStillImage(state, assets, options);
  } catch (error) {
    if (!(error instanceof StillEncodingError)) throw error;
    const key =
      error.code === 'render-unavailable'
        ? 'renderUnavailable'
        : error.code === 'dimensions'
          ? 'dimensionsError'
          : 'encodingUnavailable';
    throw new Error(
      i18n.global.t(`ScreenshotEditor.${key}`, {
        format: state.format.toUpperCase(),
      }),
    );
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
  const blob = await preview.convertToBlob({
    type: 'image/jpeg',
    quality: 0.7,
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:image/jpeg;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
}
