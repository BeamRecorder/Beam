<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowLeft, RotateCcw, Trash2 } from '@lucide/vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import ScreenshotEffectPalette from './ScreenshotEffectPalette.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
import type { DitheringEffect, DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';
import type { DitheringPanelProps } from './gradient-panel-types';

const props = defineProps<DitheringPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<DitheringEffect>]; remove: []; back: [] }>();
const { t } = useTranslate('DitheringEffect');
const { t: common } = useTranslate('GradientEffect');
const { t: colorText } = useTranslate('ColorEffect');
const open = ref({ palette: true, surface: true, adjustments: false });
const options = [2, 4, 8].map((value) => ({ value, label: value + ' × ' + value }));
const algorithms = computed(() => [
  { value: 'bayer', label: t('ordered') },
  { value: 'jarvis-judice-ninke', label: 'Jarvis–Judice–Ninke' },
]);
const mappings = computed(() => [
  { value: 'color', label: t('nearestColors') },
  { value: 'luminance', label: t('luminance') },
]);
const update = (patch: Partial<DitheringEffect>) => {
  if (!props.disabled) emit('update', patch);
};
const recipe = (patch: Partial<DitheringRecipe>) => update({ recipe: { ...props.effect.recipe, ...patch } });
const numeric = (key: 'blockSize' | 'brightness' | 'contrast', value: number) => {
  if (Number.isFinite(value))
    recipe({
      [key]: Math.max(
        key === 'blockSize' ? 1 : 0,
        Math.min(key === 'blockSize' ? 16 : 200, key === 'blockSize' ? Math.round(value) : value),
      ),
    });
};
const algorithm = (value: string | number) => {
  if (value === 'bayer' || value === 'jarvis-judice-ninke') recipe({ algorithm: value });
};
const mapping = (value: string | number) => {
  if (value === 'color' || value === 'luminance') recipe({ mapping: value });
};
const pixelSize = (value: number) => {
  if (Number.isFinite(value)) recipe({ pixelSize: Math.max(1, Math.min(16, value)) });
};
const matrixSize = (value: string | number) => {
  if (value === 2 || value === 4 || value === 8) recipe({ matrixSize: value });
};
</script>

<template>
  <fieldset class="dithering-panel" :disabled="disabled" :inert="disabled || undefined" :aria-label="t('title')">
    <div class="effect-navigation">
      <Button size="sm" variant="ghost" :icon="ArrowLeft" :aria-label="common('back')" @click="emit('back')">
        {{ common('back') }}
      </Button>
      <Tooltip :content="t('enabled')">
        <Switch
          :model-value="effect.enabled"
          :disabled="disabled"
          :aria-label="t('enabled')"
          @update:model-value="update({ enabled: $event })"
        />
      </Tooltip>
    </div>
    <div class="select-control">
      <span>{{ t('algorithm') }}</span>
      <Select
        size="sm"
        appearance="neutral"
        :model-value="effect.recipe.algorithm"
        :options="algorithms"
        :aria-label="t('algorithm')"
        :disabled="disabled"
        @update:model-value="algorithm"
      />
    </div>
    <Accordion v-model="open.palette" appearance="inspector" :title="t('palette')">
      <div class="control-stack">
        <div class="select-control">
          <span>{{ t('mapping') }}</span>
          <Select
            size="sm"
            appearance="neutral"
            :model-value="effect.recipe.mapping"
            :options="mappings"
            :aria-label="t('mapping')"
            :disabled="disabled"
            @update:model-value="mapping"
          />
        </div>
        <ScreenshotEffectPalette
          :colors="effect.recipe.colors"
          :disabled="disabled"
          @update="recipe({ colors: $event })"
        />
      </div>
    </Accordion>
    <Accordion v-model="open.surface" appearance="inspector" :title="common('surface')">
      <div class="control-stack">
        <div v-if="effect.recipe.algorithm === 'bayer'" class="select-control">
          <span>{{ t('pattern') }}</span>
          <Select
            size="sm"
            appearance="neutral"
            :model-value="effect.recipe.matrixSize"
            :options="options"
            :aria-label="t('pattern')"
            :disabled="disabled"
            @update:model-value="matrixSize"
          />
        </div>
        <BigSlider
          v-if="effect.recipe.algorithm === 'bayer'"
          :model-value="effect.recipe.pixelSize"
          :label="t('pixelSize')"
          :min="1"
          :max="16"
          :step="1"
          :default-value="1"
          :disabled="disabled"
          @update:model-value="pixelSize"
        />
        <BigSlider
          :model-value="effect.recipe.blockSize"
          :label="t('blockSize')"
          :min="1"
          :max="16"
          :step="1"
          :default-value="1"
          :disabled="disabled"
          @update:model-value="numeric('blockSize', $event)"
        />
      </div>
    </Accordion>
    <Accordion v-model="open.adjustments" appearance="inspector" :title="colorText('adjustments')">
      <div class="control-stack">
        <BigSlider
          v-for="key in ['brightness', 'contrast'] as const"
          :key="key"
          :model-value="effect.recipe[key]"
          :label="colorText(key)"
          :min="0"
          :max="200"
          :step="1"
          :default-value="100"
          :disabled="disabled"
          @update:model-value="numeric(key, $event)"
        />
      </div>
    </Accordion>
    <div class="effect-footer">
      <BigSlider
        :model-value="effect.opacity"
        :label="common('opacity')"
        :min="0"
        :max="100"
        :step="1"
        :default-value="100"
        :disabled="disabled"
        @update:model-value="update({ opacity: $event })"
      />
      <div class="effect-actions">
        <Button
          class="reset-effect"
          size="sm"
          variant="secondary"
          :icon="RotateCcw"
          :disabled="disabled"
          @click="recipe({ ...DEFAULT_DITHERING_RECIPE, colors: [...DEFAULT_DITHERING_RECIPE.colors] })"
          >{{ colorText('reset') }}</Button
        >
        <Button
          size="sm"
          icon-only
          variant="danger"
          :icon="Trash2"
          :disabled="disabled"
          :tooltip="t('remove')"
          :aria-label="t('remove')"
          @click="!disabled && emit('remove')"
        />
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.dithering-panel {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  gap: 12px;
}
.effect-navigation,
.effect-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.select-control,
.control-stack,
.effect-footer {
  display: grid;
  min-width: 0;
  gap: 12px;
}
.select-control {
  gap: 6px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
.effect-footer {
  padding-top: 4px;
}
.reset-effect {
  flex: 1;
}
</style>
