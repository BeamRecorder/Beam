import { resolveCursorAsset } from '@beam/engine/shared/cursor-assets';
import { screenCursorPresentation, cursorImageKey } from '@beam/engine/capture/screen-cursor-settings';
import { ExportValidationError, type ExportRequest } from '@beam/encoder/export-types';
import type { RequiredCursorImage } from './export-cursor-image-types';

export function requiredExportCursorAssets(request: ExportRequest): RequiredCursorImage[] {
  const { snapshot } = request;
  const images = new Map<string, RequiredCursorImage>();
  for (const clip of snapshot.composition.clips) {
    if (clip.kind !== 'screen' || !clip.enabled) continue;
    const settings = screenCursorPresentation(clip, snapshot.cursorSettings);
    if (!settings.enabled) continue;
    const pack =
      snapshot.cursorPack?.id === settings.selection.packId
        ? snapshot.cursorPack
        : snapshot.cursorPacks?.find((pack) => pack.id === settings.selection.packId);
    if (!pack)
      throw new ExportValidationError({
        code: 'missing-asset',
        message: `Cursor pack "${settings.selection.packId}" is unavailable. Import it again before exporting.`,
        assetId: settings.selection.packId,
      });
    if (!snapshot.cursor.available || !snapshot.cursor.events.length) continue;
    const assets = new Map<string, (typeof pack.cursors)[number]>();
    if (settings.selection.mode === 'fixed') {
      const asset = pack.cursors.find((asset) => asset.id === settings.selection.cursorId);
      if (asset) assets.set(asset.id, asset);
    } else
      for (const event of snapshot.cursor.events) {
        if (event.event === 'shape') {
          const asset = resolveCursorAsset(pack, settings.selection, event.cursorKind);
          assets.set(asset.id, asset);
        }
      }
    if (!assets.size) {
      const asset = resolveCursorAsset(pack, settings.selection);
      assets.set(asset.id, asset);
    }
    for (const asset of assets.values()) {
      const id = clip.cursorSettings ? cursorImageKey(pack.id, asset.id, settings.color) : asset.id;
      const existing = images.get(id);
      images.set(id, { id, asset, pack, color: settings.color, size: Math.max(settings.size, existing?.size ?? 0) });
    }
  }
  return [...images.values()];
}
