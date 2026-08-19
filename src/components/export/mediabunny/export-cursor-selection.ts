import type { CursorAssetDescriptor } from '~/api/types/cursor-pack';
import { resolveCursorAsset } from '../../video-editor/properties/cursor/cursor-packs';
import { ExportValidationError, type ExportRequest } from '../export-types';

export function requiredExportCursorAssets(request: ExportRequest): CursorAssetDescriptor[] {
  const pack = request.snapshot.cursorPack;
  if (!pack)
    throw new ExportValidationError({
      code: 'missing-asset',
      message: `Cursor pack "${request.snapshot.cursorSettings.selection.packId}" is unavailable. Import it again before exporting.`,
      assetId: request.snapshot.cursorSettings.selection.packId,
    });
  if (!request.snapshot.cursor.available || request.snapshot.cursor.events.length === 0) return [];
  const selection = request.snapshot.cursorSettings.selection;
  const assets = new Map<string, CursorAssetDescriptor>();
  if (selection.mode === 'fixed') {
    const asset = pack.cursors.find((cursor) => cursor.id === selection.cursorId);
    if (asset) assets.set(asset.id, asset);
  } else {
    for (const event of request.snapshot.cursor.events) {
      if (event.event !== 'shape') continue;
      const asset = resolveCursorAsset(pack, selection, event.cursorKind);
      assets.set(asset.id, asset);
    }
  }
  if (!assets.size) {
    const fallback = resolveCursorAsset(pack, selection);
    assets.set(fallback.id, fallback);
  }
  return [...assets.values()];
}
