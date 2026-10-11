import {
  capturedScreenshotClipboardLayer,
  copyScreenshotLayerSelection,
  pasteScreenshotLayerSelection,
} from './screenshot-layer-clipboard';
import { applyScreenshotTranslation } from './screenshot-selection-transform';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotClipboardSource } from './screenshot-layer-clipboard-types';
import type { ScreenshotTranslation } from './screenshot-types';
export function duplicateScreenshotSelection(
  state: ScreenshotState,
  source: ScreenshotClipboardSource,
  ids: readonly string[],
  primaryId: string | null,
  translation?: ScreenshotTranslation,
  idFactory?: () => string,
) {
  const unlocked = ids.filter((id) => !state.composition?.find((layer) => layer.id === id)?.locked);
  const clipboard = copyScreenshotLayerSelection(state, unlocked, primaryId, false, {
    capturedImage: capturedScreenshotClipboardLayer(state, source),
  });
  if (!clipboard) return null;
  const result = pasteScreenshotLayerSelection(state, clipboard, idFactory, !translation);
  if (translation) applyScreenshotTranslation(state, result.ids, translation);
  return result;
}
