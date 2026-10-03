import type { ScreenshotState } from './screenshot-types';
export function pruneScreenshotGroups(state: ScreenshotState) {
  const counts = new Map<string, number>();
  for (const layer of state.composition ?? [])
    if (layer.groupId) counts.set(layer.groupId, (counts.get(layer.groupId) ?? 0) + 1);
  for (const layer of state.composition ?? [])
    if (layer.groupId && counts.get(layer.groupId)! < 2) delete layer.groupId;
}
