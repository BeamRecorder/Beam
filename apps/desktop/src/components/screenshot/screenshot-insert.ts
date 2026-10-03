import type { ScreenshotInsertOptions, ScreenshotInserter } from './screenshot-insert-types';
export function screenshotInserter(options: ScreenshotInsertOptions): ScreenshotInserter {
  return async (kind) => {
    if (!options.canInsert()) return;
    switch (kind) {
      case 'shape':
      case 'arrow':
      case 'text':
      case 'drawing':
        options.selectClip();
        options.shape(kind);
        break;
      case 'image':
        await options.image();
        break;
      case 'cursor':
        options.cursor();
        break;
      case 'zoom':
        options.zoom();
        break;
      case 'blur':
      case 'highlight':
        options.effect(kind);
        break;
      default:
        throw new Error(`Unsupported screenshot insertion: ${kind}`);
    }
  };
}
