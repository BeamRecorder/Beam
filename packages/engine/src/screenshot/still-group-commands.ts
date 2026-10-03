import type { CommandRegistry } from '../commands/command-types';
import type { StillDocument } from './still-document-types';
import { jsonObject } from '../document/json-value';
import { groupScreenshotLayers, ungroupScreenshotLayers, transformScreenshotGroup } from './screenshot-groups';
import { rotateScreenshotGroup } from './screenshot-group-rotation';
import type { NormalizedTransform } from '../shared/composition-types';
const parse = (input: unknown) => {
  const value = jsonObject(input);
  if (
    !Array.isArray(value.layerIds) ||
    !value.layerIds.length ||
    value.layerIds.length > 500 ||
    value.layerIds.some((id) => typeof id !== 'string' || !id)
  )
    throw new TypeError('Invalid screenshot selection.');
  return {
    layerIds: value.layerIds as string[],
    groupId: value.groupId,
    from: value.from,
    to: value.to,
    bounds: value.bounds,
    degrees: value.degrees,
  };
};
export function registerStillGroupCommands(registry: CommandRegistry<StillDocument>) {
  registry.register({
    type: 'still.selection.group',
    parse,
    apply(document, input) {
      if (typeof input.groupId !== 'string') throw new TypeError('Group requires an identifier.');
      return { ...document, state: groupScreenshotLayers(document.state, input.layerIds, input.groupId) };
    },
  });
  registry.register({
    type: 'still.selection.ungroup',
    parse,
    apply: (document, input) => ({ ...document, state: ungroupScreenshotLayers(document.state, input.layerIds) }),
  });
  registry.register({
    type: 'still.selection.rotate',
    parse,
    apply(document, input) {
      if (typeof input.degrees !== 'number') throw new TypeError('Group rotation requires a number.');
      const bounds = jsonObject(input.bounds) as unknown as NormalizedTransform;
      return { ...document, state: rotateScreenshotGroup(document.state, input.layerIds, bounds, input.degrees) };
    },
  });
  registry.register({
    type: 'still.selection.transform',
    parse,
    apply(document, input) {
      const from = jsonObject(input.from) as unknown as NormalizedTransform,
        to = jsonObject(input.to) as unknown as NormalizedTransform;
      return { ...document, state: transformScreenshotGroup(document.state, input.layerIds, from, to) };
    },
  });
}
