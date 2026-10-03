<script setup lang="ts">
import { computed, ref } from 'vue';
import { RotateCcw, Pencil } from '@lucide/vue';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { GlassHighlightSettings } from '@beam/engine/zoom/glass-highlight-types';
import { createGlassHighlight } from '@beam/engine/zoom/glass-highlight';
import Accordion from '~/ui/accordion/Accordion.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Input from '~/ui/input/Input.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import ZoomFocusControls from './ZoomFocusControls.vue';
import type { GlassHighlightControlProps } from './zoom-control-types';

const props = defineProps<GlassHighlightControlProps>();
const emit = defineEmits<{ (event: 'update', value: ZoomElement): void }>();
const { t } = useTranslate('GlassHighlight');
const sections = ref({ placement: true, appearance: false, animation: false });
const glass = computed(() => props.zoom.glass!);
const diameterUnit = ref('px');
const units = [
  { value: 'px', label: 'px' },
  { value: '%', label: '%' },
];
const pixelDiameter = computed(
  () => glass.value.size * Math.min(props.canvasSize?.width ?? 100, props.canvasSize?.height ?? 100),
);
const patch = (value: Partial<GlassHighlightSettings>) => {
  if (props.zoom.locked) return;
  emit('update', { ...props.zoom, glass: { ...glass.value, ...value } });
};
const shape = (value: GlassHighlightSettings['shape']) => {
  if (glass.value.shape !== value) patch({ shape: value });
};
const diameter = (value: string | number) => {
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) return;
  const divisor =
    diameterUnit.value === '%' || !props.canvasSize ? 100 : Math.min(props.canvasSize.width, props.canvasSize.height);
  patch({ size: Math.min(4, Math.max(0.02, Number(value) / divisor)) });
};
const appearance = ['refraction', 'bevel', 'rim', 'dispersion', 'shadow', 'opacity'] as const;
const percent = (value: number) => `${Math.round(value)}%`;
</script>

<template>
  <div class="glass-controls">
    <Accordion v-model="sections.placement" :title="t('selection')" appearance="inspector">
      <div class="section-block">
        <ButtonGroup
          full
          size="xs"
          variant="neutral"
          :selection="{ count: 2, index: glass.shape === 'circle' ? 0 : 1 }"
        >
          <Button
            v-for="value in ['circle', 'freehand'] as const"
            :key="value"
            size="xs"
            :variant="glass.shape === value ? 'selected' : 'ghost'"
            :disabled="zoom.locked"
            @click="shape(value)"
            >{{ t(value) }}</Button
          >
        </ButtonGroup>
        <p class="hint">{{ glass.shape === 'circle' ? t('moveHint') : t('freehandHint') }}</p>
        <Button
          v-if="glass.shape === 'freehand'"
          variant="secondary"
          size="xs"
          :icon="Pencil"
          :disabled="zoom.locked"
          block
          @click="patch({ path: [] })"
          >{{ t('redraw') }}</Button
        >
        <ZoomFocusControls :zoom="zoom" :canvas-size="canvasSize" @update="emit('update', $event)" />
        <div class="diameter-row">
          <span class="label">{{ t('diameter') }}</span>
          <Input
            :model-value="Math.round(diameterUnit === '%' || !canvasSize ? glass.size * 100 : pixelDiameter)"
            type="number"
            commit-on-blur
            size="sm"
            appearance="neutral"
            :unit="canvasSize ? diameterUnit : '%'"
            :unit-options="canvasSize ? units : undefined"
            :unit-label="t('diameterUnit')"
            :disabled="zoom.locked"
            :aria-label="t('diameter')"
            @update:model-value="diameter"
            @update:unit="diameterUnit = $event"
          />
        </div>
      </div>
    </Accordion>
    <Accordion v-model="sections.appearance" :title="t('appearance')" appearance="inspector">
      <div class="section-block">
        <BigSlider
          v-for="key in appearance"
          :key="key"
          :label="t(key)"
          :model-value="glass[key] * 100"
          :min="key === 'bevel' ? 2 : 0"
          :max="key === 'bevel' ? 50 : 100"
          :step="1"
          :format-value="percent"
          :disabled="zoom.locked"
          @update:model-value="patch({ [key]: $event / 100 })"
        />
        <div class="reset-row">
          <Button
            variant="ghost"
            size="xs"
            :icon="RotateCcw"
            :disabled="zoom.locked"
            @click="
              patch({
                ...createGlassHighlight(),
                shape: glass.shape,
                size: glass.size,
                path: glass.path,
                transitionMs: glass.transitionMs,
              })
            "
            >{{ t('resetAppearance') }}</Button
          >
        </div>
      </div>
    </Accordion>
    <Accordion v-if="!still" v-model="sections.animation" :title="t('animation')" appearance="inspector">
      <BigSlider
        :label="t('transition')"
        :model-value="glass.transitionMs"
        :min="0"
        :max="1000"
        :step="10"
        :format-value="(value) => `${Math.round(value)} ms`"
        :disabled="zoom.locked"
        @update:model-value="patch({ transitionMs: $event })"
      />
    </Accordion>
  </div>
</template>

<style scoped>
.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}
.diameter-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.reset-row {
  display: flex;
  justify-content: flex-end;
}
</style>
