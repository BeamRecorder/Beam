import { SCREENSHOT_BACKGROUND_ID, SCREENSHOT_WATERMARK_ID } from '@beam/engine/screenshot/screenshot-layers';
import type { ScreenshotPanelOptions } from './screenshot-panel-types';
export function useScreenshotPanel(options: ScreenshotPanelOptions) {
  const { state, panel, cropping, selectedId } = options;
  const showSelection = (id: string | null) => {
    if (state.value?.effects?.some((effect) => effect.id === id) || state.value?.zooms?.some((zoom) => zoom.id === id))
      options.finishDrawing();
    panel.value = state.value?.zooms?.some((zoom) => zoom.id === id)
      ? 'zoom'
      : id === state.value?.image.id
        ? 'image'
        : state.value?.cursors?.some((cursor) => cursor.id === id)
          ? 'cursor'
          : !id || id === SCREENSHOT_BACKGROUND_ID || id === SCREENSHOT_WATERMARK_ID
            ? 'canvas'
            : 'shapes';
    cropping.value = false;
  };
  const selectPanel = (tab: string) => {
    if (tab === 'canvas') {
      options.finishDrawing();
      options.select(null);
    } else if (tab === 'clip') {
      showSelection(selectedId.value);
      if (panel.value === 'canvas') panel.value = 'shapes';
    } else if (tab === 'settings') {
      options.finishDrawing();
      panel.value = 'settings';
      cropping.value = false;
    }
  };
  return { showSelection, selectPanel };
}
