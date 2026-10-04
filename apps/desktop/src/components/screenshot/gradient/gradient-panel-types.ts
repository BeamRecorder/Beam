import type { GradientNumberKey, GradientLayerEffect, LayerEffect } from '@beam/engine/gradient/gradient-types';
import type { ColorAdjustmentEffect } from '@beam/engine/gradient/color-effect-types';
import type { LayerThumbnail } from '../composition/thumbnails/thumbnail-types';
import type { ScreenshotLayer, ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { Ref } from 'vue';
import type { CompositionDisabledReason } from '../composition/screenshot-layer-controls-types';
export interface GradientControlGroup {
  id: string;
  keys: GradientNumberKey[];
}
export interface ScreenshotLayerEffectsOptions {
  state: Ref<ScreenshotState | null>;
  selectedId: Ref<string | null>;
  select: (id: string) => void;
  inspect: () => void;
  disabled: () => boolean;
}
export interface GradientPanelProps {
  effect: GradientLayerEffect;
  disabled?: boolean;
}
export interface ColorPanelProps {
  effect: ColorAdjustmentEffect;
  disabled?: boolean;
}
export interface LayerEffectPanelProps {
  effect: LayerEffect;
  disabled?: boolean;
}
export interface LayerEffectToolbarProps {
  disabled?: boolean;
  disabledReason?: CompositionDisabledReason;
  direction?: 'up' | 'down';
}
export interface LayerEffectListProps {
  layer: ScreenshotLayer;
  selectedEffectId?: string | null;
  disabled?: boolean;
  thumbnails?: Record<string, LayerThumbnail>;
}
