import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotCompositionGroupBlock } from './screenshot-composition-group-types';

/** Show all members together at their group's foremost stack position. */
export function screenshotCompositionGroups(layers: readonly ScreenshotLayer[]): ScreenshotCompositionGroupBlock[] {
  const blocks: ScreenshotCompositionGroupBlock[] = [],
    groups = new Map<string, ScreenshotCompositionGroupBlock>();
  for (const layer of layers) {
    if (!layer.groupId) {
      blocks.push({ key: `layer:${layer.id}`, layers: [layer] });
      continue;
    }
    let group = groups.get(layer.groupId);
    if (!group) {
      group = { key: `group:${layer.groupId}`, groupId: layer.groupId, layers: [] };
      groups.set(layer.groupId, group);
      blocks.push(group);
    }
    group.layers.push(layer);
  }
  return blocks;
}
