import type { LayerCompositing } from '@beam/engine/shared/layer-compositing-types';
import type { ScreenshotLayer } from '@beam/engine/screenshot/screenshot-types';
import type { CompositionDisabledReason } from './screenshot-layer-controls-types';
export function layerControlDisabledReason(
  layer?: LayerCompositing,
  disabled = false,
): CompositionDisabledReason | undefined {
  if (disabled) return 'busy';
  if (!layer) return 'selectElement';
  if (layer.locked) return 'locked';
}
export function layerEffectDisabledReason(
  layer?: ScreenshotLayer,
  disabled = false,
): CompositionDisabledReason | undefined {
  const reason = layerControlDisabledReason(layer, disabled);
  if (reason) return reason;
  if (['effect', 'zoom'].includes(layer!.kind)) return 'unsupported';
  if ((layer!.effects?.length ?? 0) >= 4) return 'effectLimit';
}
