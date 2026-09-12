import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import type { Canvas2DContext } from '~/types/canvas';
import { cursorGeometry } from '../properties/cursor/cursor-packs';
import { CURSOR_SIZE_DEFAULT, CURSOR_SIZE_MAX, clampCursorSize } from '../properties/cursor/cursor-size';
import { cursorShadowOffset } from '../properties/cursor/cursor-shadow';
import { loadCursorImage } from '../properties/cursor/cursor-image-loader';
import type { ScreenshotCursorAsset, ScreenshotCursorLayer } from './screenshot-layer-types';

export function createScreenshotCursor(id: string, name: string, pack: CursorPackDescriptor): ScreenshotCursorLayer {
  return {
    id,
    name,
    enabled: true,
    position: { x: 0.45, y: 0.45 },
    size: CURSOR_SIZE_DEFAULT,
    rotation: 0,
    selection: { packId: pack.id, mode: 'fixed', cursorId: pack.defaultCursorId },
    color: '#000000',
    shadowEnabled: true,
    shadowBlur: 6,
    shadowColor: '#000000',
    shadowDirection: 'bottom',
  };
}
export function screenshotCursorTransform(
  cursor: ScreenshotCursorLayer,
  canvas: { width: number; height: number },
  asset: CursorAssetDescriptor,
): NormalizedTransform {
  const geometry = cursorGeometry(asset, (cursor.size * Math.min(canvas.width, canvas.height)) / 1080);
  return { ...cursor.position, width: geometry.width / canvas.width, height: geometry.height / canvas.height };
}
export function transformScreenshotCursor(
  cursor: ScreenshotCursorLayer,
  initial: NormalizedTransform,
  next: NormalizedTransform,
) {
  const ratio =
    Math.abs(next.width - initial.width) > Math.abs(next.height - initial.height)
      ? next.width / initial.width
      : next.height / initial.height;
  cursor.size = clampCursorSize(cursor.size * ratio);
  cursor.position = { x: next.x, y: next.y };
}
export async function loadScreenshotCursors(
  cursors: readonly ScreenshotCursorLayer[],
  packs: readonly CursorPackDescriptor[],
  canvas: { width: number; height: number },
): Promise<Map<string, ScreenshotCursorAsset>> {
  return new Map(
    await Promise.all(
      cursors
        .filter((cursor) => cursor.enabled)
        .map(async (cursor) => {
          const pack = packs.find((pack) => pack.id === cursor.selection.packId);
          const asset = pack?.cursors.find((asset) => asset.id === cursor.selection.cursorId);
          if (!pack || !asset)
            throw new Error(`Cursor asset unavailable: ${cursor.selection.packId}/${cursor.selection.cursorId}`);
          // Decode once at the maximum editable size; resizing a cursor must not reload its asset.
          const raster = cursorGeometry(asset, (CURSOR_SIZE_MAX * Math.min(canvas.width, canvas.height)) / 1080);
          const image = await loadCursorImage(
            pack,
            asset,
            Math.max(1, raster.width),
            Math.max(1, raster.height),
            cursor.color,
          );
          return [cursor.id, { image, asset }] as const;
        }),
    ),
  );
}
export function drawScreenshotCursor(
  ctx: Canvas2DContext,
  cursor: ScreenshotCursorLayer,
  asset: ScreenshotCursorAsset,
  width: number,
  height: number,
) {
  const rect = screenshotCursorTransform(cursor, { width, height }, asset.asset);
  const w = rect.width * width,
    h = rect.height * height;
  const scale = Math.min(width, height) / 1080;
  ctx.save();
  ctx.translate(rect.x * width + w / 2, rect.y * height + h / 2);
  ctx.rotate((cursor.rotation * Math.PI) / 180);
  if (cursor.shadowEnabled) {
    const blur = cursor.shadowBlur * scale;
    const offset = cursorShadowOffset(blur, cursor.shadowDirection);
    ctx.shadowBlur = blur;
    ctx.shadowColor = cursor.shadowColor;
    ctx.shadowOffsetX = offset.x;
    ctx.shadowOffsetY = offset.y;
  }
  ctx.drawImage(asset.image, -w / 2, -h / 2, w, h);
  ctx.restore();
}
