import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
export const hasCpuLayerEffects = (effects?: readonly LayerEffect[]) =>
  Boolean(
    effects?.some(
      (effect) =>
        effect.enabled &&
        effect.opacity > 0 &&
        effect.kind === 'dithering' &&
        effect.recipe.algorithm === 'jarvis-judice-ninke',
    ),
  );
export const screenshotHasCpuEffects = (state: ScreenshotState) =>
  screenshotLayers(state).some((layer) => layer.visible && layer.opacity > 0 && hasCpuLayerEffects(layer.effects));
