import type { ScreenshotState } from './screenshot-types';
import { screenshotLayers } from './screenshot-layers';
import { defaultLayerCompositing } from '../shared/layer-compositing';
import type { LayerCompositing } from '../shared/layer-compositing-types';

/** Move explicit members, rather than expanding the source groups. */
export function canMoveScreenshotLayersToGroup(
  state: ScreenshotState,
  ids: readonly string[],
  groupId: string | null,
): boolean {
  const selected = new Set(ids),
    layers = screenshotLayers(state);
  const sources = layers.filter((layer) => selected.has(layer.id));
  const target = groupId === null ? [] : layers.filter((layer) => layer.groupId === groupId);
  const sourceGroups = new Set(sources.map((layer) => layer.groupId).filter(Boolean));
  return (
    selected.size > 0 &&
    selected.size <= 500 &&
    sources.length === selected.size &&
    (groupId === null || target.length >= 2) &&
    [...sources, ...target].every(
      (layer) => !layer.locked && !['background', 'watermark', 'zoom'].includes(layer.kind),
    ) &&
    !layers.some((layer) => layer.groupId && sourceGroups.has(layer.groupId) && layer.locked)
  );
}

export function moveScreenshotLayersToGroup(
  state: ScreenshotState,
  ids: readonly string[],
  groupId: string | null,
  frontIndex?: number,
): ScreenshotState {
  if (!canMoveScreenshotLayersToGroup(state, ids, groupId))
    throw new Error('Cannot move these elements into the group.');
  const members = new Set(ids);
  let composition: LayerCompositing[] = (
    state.composition ?? screenshotLayers(state).map((layer) => defaultLayerCompositing(layer.id))
  ).map((layer) => {
    if (!members.has(layer.id)) return layer;
    if (groupId !== null) return { ...layer, groupId };
    const { groupId: _group, ...standalone } = layer;
    return standalone;
  });
  if (frontIndex !== undefined) {
    if (!Number.isInteger(frontIndex) || frontIndex < 0 || frontIndex > composition.length - members.size)
      throw new TypeError('Invalid group insertion index.');
    const front = [...composition].reverse(),
      moved = front.filter((layer) => members.has(layer.id));
    const remaining = front.filter((layer) => !members.has(layer.id));
    remaining.splice(frontIndex, 0, ...moved);
    composition = remaining.reverse();
  }
  const counts = new Map<string, number>();
  for (const layer of composition) if (layer.groupId) counts.set(layer.groupId, (counts.get(layer.groupId) ?? 0) + 1);
  return {
    ...state,
    composition: composition.map((layer) => {
      if (!layer.groupId || counts.get(layer.groupId)! >= 2) return layer;
      const { groupId: _group, ...standalone } = layer;
      return standalone;
    }),
  };
}
