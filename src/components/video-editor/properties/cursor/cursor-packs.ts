import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import builtinCursorPacks from './builtin-cursor-packs.json';
import macosCursorPack from './macos-cursor-pack.json';

export const MACOS_CURSOR_PACK: CursorPackDescriptor = {
  ...macosCursorPack, source: 'builtin', colorMode: 'tintable',
  cursors: macosCursorPack.cursors.map(cursor => ({ ...cursor, format: 'svg', url: resolvePublicAssetUrl(cursor.url) })),
};

export const BUNDLED_CURSOR_PACKS: CursorPackDescriptor[] = (
  builtinCursorPacks as unknown as CursorPackDescriptor[]
).map((pack) => ({
  ...pack,
  cursors: pack.cursors.map((cursor) => ({ ...cursor, url: resolvePublicAssetUrl(cursor.url) })),
}));

export const BUILTIN_CURSOR_PACKS = [MACOS_CURSOR_PACK, ...BUNDLED_CURSOR_PACKS];

export const cursorAssetSupportsTint = (pack: CursorPackDescriptor, asset: CursorAssetDescriptor) =>
  (asset.format ?? 'svg') === 'svg' && (asset.tintable ?? pack.colorMode === 'tintable');

const ROLE_CANDIDATES: Record<string, string[]> = {
  default: ['default', 'left_ptr', 'arrow'],
  handpointing: ['handpointing', 'pointer', 'hand2'],
  handopen: ['handopen', 'grab', 'openhand'],
  handgrabbing: ['handgrabbing', 'grabbing', 'closedhand'],
  textcursor: ['textcursor', 'text', 'xterm'],
  textcursorvertical: ['textcursorvertical', 'vertical-text'],
  cross: ['cross', 'crosshair'],
  notallowed: ['notallowed', 'not-allowed', 'forbidden'],
  move: ['move', 'all-scroll'],
  copy: ['copy'],
  help: ['help'],
  busy: ['busy', 'progress'],
  beachball: ['beachball', 'wait'],
  resizenorthsouth: ['resizenorthsouth', 'ns-resize', 'row-resize'],
  resizewesteast: ['resizewesteast', 'ew-resize', 'col-resize'],
  resizenorthwestsoutheast: ['resizenorthwestsoutheast', 'nwse-resize'],
  resizenortheastsouthwest: ['resizenortheastsouthwest', 'nesw-resize'],
};

const cursorLookupCache = new WeakMap<CursorAssetDescriptor[], Map<string, CursorAssetDescriptor>>();

const cursorLookupFor = (cursors: CursorAssetDescriptor[]) => {
  const cached = cursorLookupCache.get(cursors);
  if (cached) return cached;
  const lookup = new Map(cursors.map((cursor) => [cursor.id, cursor]));
  cursorLookupCache.set(cursors, lookup);
  return lookup;
};

export function resolveCursorAsset(
  pack: CursorPackDescriptor,
  selection: CursorSelection,
  recordedRole?: string | null,
): CursorAssetDescriptor {
  const byId = cursorLookupFor(pack.cursors);
  if (selection.mode === 'fixed' && selection.cursorId && byId.has(selection.cursorId))
    return byId.get(selection.cursorId)!;
  const mapped = recordedRole ? pack.automaticMap[recordedRole] : undefined;
  if (mapped && byId.has(mapped)) return byId.get(mapped)!;
  for (const candidate of ROLE_CANDIDATES[recordedRole ?? 'default'] ?? [recordedRole ?? 'default']) {
    if (byId.has(candidate)) return byId.get(candidate)!;
  }
  return byId.get(pack.defaultCursorId) ?? pack.cursors[0]!;
}

export function cursorGeometry(asset: CursorAssetDescriptor, size: number) {
  const scale = size / asset.nominalSize;
  return {
    width: Math.max(1, asset.intrinsicSize.width * scale),
    height: Math.max(1, asset.intrinsicSize.height * scale),
    hotspot: { x: asset.hotspot.x * scale, y: asset.hotspot.y * scale },
  };
}

export const orderedCursorPacks = (imported: CursorPackDescriptor[]) => [
  ...BUILTIN_CURSOR_PACKS,
  ...imported
    .filter((pack) => !BUILTIN_CURSOR_PACKS.some((builtin) => builtin.id === pack.id))
    .sort((a, b) => a.name.localeCompare(b.name)),
];
