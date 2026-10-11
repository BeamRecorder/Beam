import type { ScreenshotEditingShortcutOptions } from './screenshot-editing-shortcut-types';
import { useScreenshotLayerShortcuts } from './useScreenshotLayerShortcuts';
import { screenshotLayers, canRemoveScreenshotLayer } from '@beam/engine/screenshot/screenshot-layers';
import { duplicateScreenshotSelection } from './duplicate-screenshot-selection';
import type { ScreenshotTranslation } from './screenshot-types';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
export function useScreenshotEditingShortcuts(options: ScreenshotEditingShortcutOptions) {
  const duplicate = (translation?: ScreenshotTranslation) => {
    const state = options.state.value,
      source = options.source();
    if (!state || !source || options.disabled()) return false;
    beginPropertyInteraction();
    try {
      const result = duplicateScreenshotSelection(
        state,
        source,
        options.selectedIds.value,
        options.selectedId.value,
        translation,
      );
      if (!result) return false;
      options.selectMany(result.ids, result.primaryId);
      options.showSelection(result.primaryId);
      return true;
    } catch (error) {
      options.fail(error);
      return false;
    } finally {
      endPropertyInteraction();
    }
  };
  useScreenshotLayerShortcuts({
    ...options,
    selected: () =>
      options.state.value
        ? screenshotLayers(options.state.value).find(
            (layer) => options.selectedIds.value.includes(layer.id) && canRemoveScreenshotLayer(layer),
          )
        : undefined,
    selectAll: () =>
      options.selectMany(
        options.state.value
          ? screenshotLayers(options.state.value)
              .filter((layer) => !layer.locked)
              .map((layer) => layer.id)
          : [],
      ),
    deselect: () => {
      options.selectMany([]);
      options.showSelection(null);
    },
    duplicate: () => duplicate(),
  });
  return duplicate;
}
