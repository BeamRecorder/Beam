import { computed, ref, watch } from 'vue';
import { createGradientEffect, createColorEffect, validateLayerEffects } from '@beam/engine';
import { LAYER_BLEND_MODES } from '@beam/engine/shared/layer-compositing';
import { screenshotLayers, updateScreenshotLayer } from '@beam/engine/screenshot/screenshot-layers';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
import type { LayerEffectAddKind } from '@beam/engine/gradient/color-effect-types';
import type { ScreenshotLayerEffectsOptions } from './gradient-panel-types';

export function useScreenshotLayerEffects(options: ScreenshotLayerEffectsOptions) {
  const effectId = ref<string | null>(null);
  const layer = computed(() =>
    options.state.value
      ? screenshotLayers(options.state.value).find((item) => item.id === options.selectedId.value)
      : undefined,
  );
  const selected = computed(
    () => layer.value?.effects?.find((effect) => effect.id === effectId.value) ?? layer.value?.effects?.[0],
  );
  watch(
    options.selectedId,
    () => {
      effectId.value = null;
    },
    { flush: 'sync' },
  );
  const editable = () => Boolean(options.state.value && layer.value && !layer.value.locked && !options.disabled());
  const commit = (effects: LayerEffect[]) => {
    if (!editable()) return;
    validateLayerEffects(effects, LAYER_BLEND_MODES);
    beginPropertyInteraction();
    try {
      updateScreenshotLayer(options.state.value!, layer.value!.id, { effects });
    } finally {
      endPropertyInteraction();
    }
  };
  const select = (id: string, selectedEffectId: string) => {
    const target = options.state.value && screenshotLayers(options.state.value).find((item) => item.id === id);
    if (options.disabled() || !target?.effects?.some((effect) => effect.id === selectedEffectId)) return false;
    options.select(id);
    effectId.value = selectedEffectId;
    options.inspect();
    return true;
  };
  const add = (id: string, kind: LayerEffectAddKind = 'gradient') => {
    if (!options.state.value || options.disabled()) return;
    const target = screenshotLayers(options.state.value).find((item) => item.id === id);
    if (!target || target.locked || ['effect', 'zoom'].includes(target.kind) || (target.effects?.length ?? 0) >= 4)
      return;
    options.select(id);
    const effect =
      kind === 'gradient'
        ? createGradientEffect(crypto.randomUUID())
        : createColorEffect(crypto.randomUUID(), kind === 'grayscale');
    commit([...(target.effects ?? []), effect]);
    effectId.value = effect.id;
    options.inspect();
  };
  const update = (patch: Partial<LayerEffect>) => {
    if (!selected.value) return;
    commit(
      layer.value!.effects!.map((effect) =>
        effect.id === selected.value!.id
          ? ({ ...effect, ...patch, id: effect.id, kind: effect.kind } as LayerEffect)
          : effect,
      ),
    );
  };
  const remove = () => {
    if (!selected.value || !editable()) return;
    const remaining = layer.value!.effects!.filter((effect) => effect.id !== selected.value!.id);
    commit(remaining);
    effectId.value = remaining[0]?.id ?? null;
    if (!remaining.length) options.select(layer.value!.id);
  };
  const toggle = (id: string, targetEffectId: string) => {
    if (select(id, targetEffectId) && selected.value) update({ enabled: !selected.value.enabled });
  };
  return { selected, effectId, add, select, update, remove, toggle };
}
