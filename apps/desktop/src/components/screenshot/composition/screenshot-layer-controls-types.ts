import type { LayerCompositing } from '@beam/engine/shared/layer-compositing-types';
export type CompositionDisabledReason = 'selectElement' | 'locked' | 'busy' | 'effectLimit' | 'unsupported';
export interface ScreenshotLayerControlsProps {
  layer?: LayerCompositing;
  disabled?: boolean;
}
export interface ScreenshotOpacityProps {
  modelValue: number;
  disabled?: boolean;
}
