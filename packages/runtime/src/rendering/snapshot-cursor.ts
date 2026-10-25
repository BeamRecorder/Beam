import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { CursorSelection } from '@beam/engine/capture/cursor-pack';
import { screenCursorPresentation, cursorImageKey } from '@beam/engine/capture/screen-cursor-settings';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import type { SnapshotCursorMotionCache } from './snapshot-cursor-types';

const resolved = new WeakMap<CompositionSnapshot, CompositionSnapshot>();
const motions = new WeakMap<CompositionSnapshot, SnapshotCursorMotionCache>();

/** Resolve once before rendering scene/lens passes; preview raster scaling never changes export sizing. */
export function snapshotWithScreenCursor(
  snapshot: CompositionSnapshot,
  screen: VisualClip | null | undefined,
  previewScale = 1,
  previewSelection?: CursorSelection | null,
): CompositionSnapshot {
  if (resolved.has(snapshot) || (!screen?.cursorSettings && !previewSelection)) return snapshot;
  let settings = screenCursorPresentation(screen, snapshot.cursorSettings);
  if (screen?.cursorSettings && previewScale !== 1)
    settings = {
      ...settings,
      size: settings.size * previewScale,
      shadow: { ...settings.shadow, blur: settings.shadow.blur * previewScale },
    };
  if (previewSelection) settings = { ...settings, selection: previewSelection };
  const pack =
    snapshot.cursorPack?.id === settings.selection.packId
      ? snapshot.cursorPack
      : (snapshot.cursorPacks?.find((pack) => pack.id === settings.selection.packId) ?? null);
  const next = { ...snapshot, cursorSettings: settings, cursorPack: pack };
  resolved.set(next, snapshot);
  return next;
}

export function snapshotCursorImageKey(snapshot: CompositionSnapshot, screen: VisualClip, assetId: string): string {
  return screen.cursorSettings
    ? cursorImageKey(snapshot.cursorSettings.selection.packId, assetId, snapshot.cursorSettings.color)
    : assetId;
}

export function snapshotCursorMotion(snapshot: CompositionSnapshot, width: number, height: number) {
  const root = resolved.get(snapshot) ?? snapshot;
  let cache = motions.get(root);
  if (!cache || cache.events !== snapshot.cursor.events || cache.hover !== snapshot.cursor.hoverSync) {
    cache = { events: snapshot.cursor.events, hover: snapshot.cursor.hoverSync, players: new Map() };
    motions.set(root, cache);
  }
  const key = JSON.stringify([width, height, snapshot.cursorSettings.motion]);
  let player = cache.players.get(key);
  if (!player) {
    player = createCursorMotionPlayer(
      snapshot.cursor.events,
      snapshot.cursorSettings.motion,
      width,
      height,
      snapshot.cursor.hoverSync,
    );
    if (cache.players.size >= 16) cache.players.delete(cache.players.keys().next().value!);
    cache.players.set(key, player);
  }
  return player;
}
