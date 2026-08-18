import type { CursorAssetDescriptor, CursorPackDescriptor, CursorSelection } from '~/api/types/cursor-pack';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import builtinCursorPacks from './builtin-cursor-packs.json';

const HOTSPOTS: Record<string, { x: number; y: number }> = {
  default: { x: 10, y: 7 },
  beachball: { x: 16, y: 16 },
  busy: { x: 7, y: 0 },
  cell: { x: 16, y: 16 },
  contextualmenu: { x: 8, y: 7 },
  copy: { x: 7, y: 0 },
  cross: { x: 16, y: 16 },
  handgrabbing: { x: 16, y: 16 },
  handopen: { x: 16, y: 16 },
  handpointing: { x: 12, y: 10 },
  help: { x: 7, y: 0 },
  makealias: { x: 7, y: 0 },
  move: { x: 16, y: 16 },
  notallowed: { x: 7, y: 0 },
  poof: { x: 7, y: 0 },
  resizenorth: { x: 16, y: 16 },
  resizenortheast: { x: 16, y: 16 },
  resizenortheastsouthwest: { x: 16, y: 16 },
  resizenorthsouth: { x: 16, y: 16 },
  resizenorthwest: { x: 16, y: 16 },
  resizenorthwestsoutheast: { x: 16, y: 16 },
  resizeright: { x: 16, y: 16 },
  resizesouth: { x: 16, y: 16 },
  resizesoutheast: { x: 16, y: 16 },
  resizesouthwest: { x: 16, y: 16 },
  resizeup: { x: 16, y: 16 },
  resizeupdown: { x: 16, y: 16 },
  resizewest: { x: 16, y: 16 },
  resizewesteast: { x: 16, y: 16 },
  screenshotselection: { x: 16, y: 16 },
  screenshotwindow: { x: 16, y: 16 },
  textcursor: { x: 16, y: 16 },
  textcursorvertical: { x: 16, y: 16 },
  zoomin: { x: 16, y: 16 },
  zoomout: { x: 16, y: 16 },
};

const labelFor = (id: string) =>
  id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const MACOS_CURSOR_PACK: CursorPackDescriptor = {
  id: 'builtin:macos',
  name: 'macOS',
  source: 'builtin',
  colorMode: 'tintable',
  defaultCursorId: 'default',
  cursors: Object.entries(HOTSPOTS).map(([id, hotspot]) => ({
    id,
    label: `macOS ${labelFor(id)}`,
    url: resolvePublicAssetUrl(`/macOsSvgCursors/${id}.svg`),
    intrinsicSize: { width: 32, height: 32 },
    nominalSize: 32,
    hotspot,
  })),
  automaticMap: Object.fromEntries(Object.keys(HOTSPOTS).map((id) => [id, id])),
};

export const BUNDLED_CURSOR_PACKS: CursorPackDescriptor[] = (builtinCursorPacks as unknown as CursorPackDescriptor[]).map(
  (pack) => ({
    ...pack,
    cursors: pack.cursors.map((cursor) => ({ ...cursor, url: resolvePublicAssetUrl(cursor.url) })),
  }),
);

export const BUILTIN_CURSOR_PACKS = [MACOS_CURSOR_PACK, ...BUNDLED_CURSOR_PACKS];

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

export function resolveCursorAsset(
  pack: CursorPackDescriptor,
  selection: CursorSelection,
  recordedRole?: string | null,
): CursorAssetDescriptor {
  const byId = new Map(pack.cursors.map((cursor) => [cursor.id, cursor]));
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
