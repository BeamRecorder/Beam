import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { useScreenshotEditor } from './useScreenshotEditor';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';

export interface ScreenshotGroupInspectorProps {
  editor: ReturnType<typeof useScreenshotEditor>;
  bounds: NormalizedTransform | null;
}
export interface ScreenshotGroupTransformGesture {
  state: ScreenshotState;
  bounds: NormalizedTransform;
  rotation: number;
}
