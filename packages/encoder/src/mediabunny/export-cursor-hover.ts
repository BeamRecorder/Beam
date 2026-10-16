import type { ExportRequest } from '../export-types';
import type { ExportAssets } from './export-worker-assets';
import type { HoverSource } from '@beam/runtime/cursor/hover/hover-types';
import { packHoverPath } from '@beam/runtime/cursor/hover/hover-path';
import { analyzeCursorHovers } from '@beam/runtime/cursor/hover/hover-analysis';
import { hoverCacheKey, readHoverCache, writeHoverCache } from '@beam/runtime/cursor/hover/hover-analysis-cache';

/** Export can start before the editor's background pass, or without an editor (CLI). */
export async function prepareExportCursorHovers(
  request: ExportRequest,
  assets: ExportAssets,
  signal: AbortSignal,
): Promise<ExportRequest> {
  const { snapshot } = request;
  if (
    snapshot.cursor.hoverSync ||
    !snapshot.cursorSettings.enabled ||
    snapshot.cursorSettings.motion.smoothing <= 0 ||
    !snapshot.cursor.available ||
    !snapshot.cursor.events.length
  )
    return request;
  const ids = new Set(snapshot.composition.clips.flatMap((clip) => (clip.kind === 'screen' ? [clip.assetId] : [])));
  const sources: HoverSource[] =
    snapshot.cursor.hoverSources ??
    [...assets.assets.values()]
      .filter(({ asset }) => ids.has(asset.id) && asset.origin === 'session')
      .map(({ asset, duration }) => ({
        id: asset.id,
        src: asset.src,
        startSeconds: (asset.sessionStartMs ?? 0) / 1000,
        durationSeconds: Math.min(duration, asset.durationMs / 1000),
      }))
      .sort((a, b) => a.startSeconds - b.startSeconds);
  if (!sources.length) return request;
  const input = { sources, path: packHoverPath(snapshot.cursor.events) };
  const key = await hoverCacheKey(input);
  const sync = (await readHoverCache(key)) ?? (await analyzeCursorHovers(input, signal));
  signal.throwIfAborted();
  await writeHoverCache(key, sync);
  return { ...request, snapshot: { ...snapshot, cursor: { ...snapshot.cursor, hoverSync: sync } } };
}
