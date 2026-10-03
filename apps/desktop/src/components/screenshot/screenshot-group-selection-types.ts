import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
export interface ScreenshotGroupSelectionProps {
  bounds: NormalizedTransform;
  viewport: { width: number; height: number };
  muted?: boolean;
}
