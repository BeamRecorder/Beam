import type { useScreenshotEditor } from './useScreenshotEditor';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
export interface ScreenshotLayerInspectorProps {
  editor: ReturnType<typeof useScreenshotEditor>;
  bounds: NormalizedTransform | null;
}
