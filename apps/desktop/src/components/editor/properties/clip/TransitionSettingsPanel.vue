<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import { TRANSITION_CATEGORIES } from '@beam/engine/shared/transition-presets';
import type { TransitionCard } from '@beam/engine/shared/transition-catalog-types';
import { useTransitionGalleryState } from './useTransitionGalleryState';
import { Check, RotateCcw } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import TransitionPresetPreview from './TransitionPresetPreview.vue';
import type { ClipTransition, ClipTransitions, TransitionPreset } from '@beam/engine/shared/composition-types';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  DEFAULT_TRANSITION_EASING_POWER,
  MAX_TRANSITION_EASING_POWER,
  MIN_TRANSITION_EASING_POWER,
} from '@beam/engine/shared/clip-transitions';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('TransitionsPanel');
const props = withDefaults(
  defineProps<{
    transitions: ClipTransitions;
    timelineDurationMs: number;
    domain?: 'visual' | 'audio';
    initialEdge?: 'entry' | 'exit';
  }>(),
  { domain: 'visual', initialEdge: 'entry' },
);
const emit = defineEmits<{
  (event: 'update', edge: 'entry' | 'exit', value: ClipTransition | null): void;
}>();
const edge = ref<'entry' | 'exit'>(props.initialEdge);
const hovered = ref<string | null>(null);
watch(
  () => props.initialEdge,
  (value) => (edge.value = value),
);
const current = computed(() => props.transitions[edge.value]);
const oppositeEdge = computed<'entry' | 'exit'>(() => (edge.value === 'entry' ? 'exit' : 'entry'));
const maxDuration = computed(() =>
  Math.max(1, Math.min(5_000, props.timelineDurationMs - (props.transitions[oppositeEdge.value]?.durationMs ?? 0))),
);
const { category, setCategory } = useTransitionGalleryState();
const fadeCard = TRANSITION_CATEGORIES[0].presets[0];
const selected = (card: TransitionCard) =>
  current.value?.preset.kind === card.preset.kind &&
  ('direction' in card.preset
    ? 'direction' in current.value.preset && current.value.preset.direction === card.preset.direction
    : true);
const choose = (preset: TransitionPreset | null) => {
  if (!preset) return emit('update', edge.value, null);
  const easingPower =
    current.value?.easingPower ?? (props.domain === 'visual' ? DEFAULT_TRANSITION_EASING_POWER : null);
  emit('update', edge.value, {
    preset,
    durationMs: Math.min(current.value?.durationMs ?? DEFAULT_TRANSITION_DURATION_MS, maxDuration.value),
    ...(easingPower === null ? {} : { easingPower }),
  });
};
</script>

<template>
  <section class="transitions-panel" @pointerdown.stop @click.stop>
    <ButtonGroup class="edge-selector" :columns="2" full size="xs" :aria-label="t('clipTransitions')">
      <Button
        v-for="value in ['entry', 'exit'] as const"
        :key="value"
        size="xs"
        :variant="edge === value ? 'secondary' : 'ghost'"
        :aria-pressed="edge === value"
        @click="edge = value"
        >{{ t(value) }}</Button
      >
    </ButtonGroup>

    <div class="transition-choice-actions" role="radiogroup" :aria-label="t('presetLabel', { edge: t(edge) })">
      <Button
        :variant="current ? 'ghost' : 'secondary'"
        size="xs"
        block
        :icon="current ? RotateCcw : Check"
        data-transition-preset="none"
        class="none-preset"
        role="radio"
        :aria-checked="!current"
        @click="choose(null)"
        >{{ t('none') }}</Button
      >
      <Button
        v-if="domain === 'audio'"
        :variant="selected(fadeCard) ? 'secondary' : 'ghost'"
        size="xs"
        class="audio-fade-preset"
        data-transition-preset="fade"
        role="radio"
        :aria-checked="selected(fadeCard)"
        @click="choose(fadeCard.preset)"
        >{{ t('fade') }}</Button
      >
    </div>

    <div v-if="current" class="duration-control">
      <BigSlider
        class="duration-slider"
        :model-value="current.durationMs"
        :default-value="DEFAULT_TRANSITION_DURATION_MS"
        :min="1"
        :max="maxDuration"
        :step="1"
        :label="t('duration')"
        :format-value="(value) => `${value} ms`"
        @update:model-value="emit('update', edge, { ...current, durationMs: $event })"
      />
    </div>

    <BigSlider
      v-if="current && domain === 'visual'"
      class="curve-slider"
      :model-value="current.easingPower ?? DEFAULT_TRANSITION_EASING_POWER"
      :default-value="DEFAULT_TRANSITION_EASING_POWER"
      :min="MIN_TRANSITION_EASING_POWER"
      :max="MAX_TRANSITION_EASING_POWER"
      :step="1"
      :label="t('curve')"
      :format-value="(value) => `×${value}`"
      @update:model-value="emit('update', edge, { ...current, easingPower: $event })"
    />

    <ColorPicker
      v-if="current && 'color' in current.preset"
      :model-value="current.preset.color"
      show-label
      :label="t('color')"
      @update:model-value="emit('update', edge, { ...current, preset: { ...current.preset, color: $event } })"
    />
    <div v-if="domain !== 'audio'" class="transition-categories">
      <Accordion
        v-for="group in TRANSITION_CATEGORIES"
        :key="group.id"
        appearance="inspector"
        :data-transition-category="group.id"
        :title="t(group.labelKey)"
        :model-value="category === group.id"
        @update:model-value="setCategory($event ? group.id : null)"
      >
        <div class="preset-gallery" role="radiogroup" :aria-label="t(group.labelKey)">
          <Button
            v-for="card in group.presets"
            :key="card.id"
            variant="card"
            class="preset-card"
            :data-transition-preset="card.id"
            :class="{ 'is-selected': selected(card) }"
            role="radio"
            :aria-checked="selected(card)"
            @mouseenter="hovered = card.id"
            @mouseleave="hovered = null"
            @focus="hovered = card.id"
            @blur="hovered = null"
            @click="choose(card.preset)"
          >
            <span class="preview-frame preset-card-media">
              <TransitionPresetPreview
                :preset="selected(card) ? current!.preset : card.preset"
                :visible="category === group.id"
                :active="category === group.id && (hovered === card.id || selected(card))"
              />
              <span v-if="selected(card)" class="selected-mark"><Check :size="11" stroke-width="2.5" /></span>
            </span>
            <span class="preset-card-info"
              ><strong>{{ t(card.labelKey) }}</strong></span
            >
          </Button>
        </div>
      </Accordion>
    </div>
  </section>
</template>

<style scoped>
.transitions-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}
.edge-selector {
  align-self: stretch;
}
.preset-gallery {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.preset-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
  color: var(--text-primary);
  transform: none !important;
}
.preset-card:hover:not(.is-selected) {
  border-color: var(--text-primary) !important;
}
.preset-card.is-selected,
.preset-card.is-selected:hover {
  border-color: var(--text-secondary) !important;
  box-shadow: 0 0 0 2px var(--color-bg-field) !important;
}
.preset-card-media {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  border-radius: calc(var(--radius-md) - 1px) calc(var(--radius-md) - 1px) 0 0;
  background: var(--color-bg-surface);
}
.selected-mark {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: var(--radius-full);
  background: var(--color-bg-field-active);
  color: var(--text-primary);
  box-shadow: 0 1px 5px rgb(0 0 0 / 0.34);
}
.preset-card-info {
  display: grid;
  width: 100%;
  gap: 1px;
  padding: 5px 7px 6px;
  box-sizing: border-box;
}
.preset-card-info strong,
.preset-card-info small {
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-card-info strong {
  font-size: 11px;
  line-height: 1.2;
}
.preset-card-info small {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.1;
}
.transition-choice-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  align-self: stretch;
}
@media (prefers-reduced-motion: reduce) {
  .preset-card {
    transition: none;
  }
}
</style>
