<script setup lang="ts">
import { computed } from 'vue';
import Select from '~/ui/select/Select.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import ScreenshotOpacity from './ScreenshotOpacity.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { LAYER_BLEND_MODES } from '@beam/engine/shared/layer-compositing';
import type { LayerBlendMode, LayerCompositing } from '@beam/engine/shared/layer-compositing-types';
import type { ScreenshotLayerControlsProps } from './screenshot-layer-controls-types';
import { layerControlDisabledReason } from './composition-disabled-reason';
const props = defineProps<ScreenshotLayerControlsProps>();
const emit = defineEmits<{ update: [patch: Partial<LayerCompositing>] }>();
const { t } = useTranslate('ScreenshotComposition');
const { t: blendText } = useTranslate('BlendModes');
const { t: effectText } = useTranslate('LayerEffects');
const disabledReason = computed(() => layerControlDisabledReason(props.layer, props.disabled));
const blendOptions = computed(() => LAYER_BLEND_MODES.map((value) => ({ value, label: blendText(value) })));
const update = (patch: Partial<LayerCompositing>) => {
  if (props.layer && !props.disabled && !props.layer.locked) emit('update', patch);
};
</script>

<template>
  <fieldset class="compositing-controls" :disabled="disabled || !layer || layer.locked">
    <Tooltip
      class="control-hint"
      :content="disabledReason && effectText(disabledReason)"
      :disabled="!disabledReason"
      :delay="200"
      :tabindex="disabledReason ? 0 : undefined"
      :aria-label="disabledReason && effectText(disabledReason)"
    >
      <Select
        size="sm"
        appearance="neutral"
        :aria-label="t('blendMode')"
        :model-value="layer?.blendMode ?? 'source-over'"
        :options="blendOptions"
        :disabled="disabled || !layer || layer.locked"
        @update:model-value="update({ blendMode: $event as LayerBlendMode })"
      />
    </Tooltip>
    <Tooltip
      class="control-hint"
      :content="disabledReason && effectText(disabledReason)"
      :disabled="!disabledReason"
      :delay="200"
      :tabindex="disabledReason ? 0 : undefined"
      :aria-label="disabledReason && effectText(disabledReason)"
    >
      <ScreenshotOpacity
        :model-value="layer?.opacity ?? 100"
        :disabled="disabled || !layer || layer.locked"
        @update:model-value="update({ opacity: $event })"
      />
    </Tooltip>
  </fieldset>
</template>

<style scoped>
.compositing-controls {
  border: 0;
  margin: 0;
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}
.compositing-controls:disabled {
  opacity: 0.45;
}
.control-hint {
  width: 100%;
  min-width: 0;
}
</style>
