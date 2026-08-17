<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import TransitionPresetPreview from './TransitionPresetPreview.vue';
import type { ClipTransition, ClipTransitions, TransitionPreset } from '~/media/shared/composition-types';
import { DEFAULT_TRANSITION_DURATION_MS } from '~/media/shared/clip-transitions';
import { useTranslate } from '~/i18n/useTranslate';

type Edge = 'entry' | 'exit';
type PresetCard = { id: string; label: string; detail: string; preset: TransitionPreset | null };
const { t } = useTranslate('TransitionsPanel');
const props = withDefaults(
  defineProps<{
    transitions: ClipTransitions;
    timelineDurationMs: number;
    domain?: 'visual' | 'audio';
    initialEdge?: Edge;
  }>(),
  { domain: 'visual', initialEdge: 'entry' },
);
const emit = defineEmits<{ (event: 'update', edge: Edge, value: ClipTransition | null): void }>();
const edge = ref<Edge>(props.initialEdge);
const hovered = ref<string | null>(null);
watch(
  () => props.initialEdge,
  (value) => (edge.value = value),
);
const current = computed(() => props.transitions[edge.value]);
const oppositeEdge = computed<Edge>(() => (edge.value === 'entry' ? 'exit' : 'entry'));
const maxDuration = computed(() =>
  Math.max(1, Math.min(5_000, props.timelineDurationMs - (props.transitions[oppositeEdge.value]?.durationMs ?? 0))),
);
const cards = computed<PresetCard[]>(() => [
  { id: 'none', label: t('none'), detail: t('noneDetail'), preset: null },
  { id: 'fade', label: t('fade'), detail: t('fadeDetail'), preset: { kind: 'fade' } },
  ...(props.domain === 'audio'
    ? []
    : ([
        {
          id: 'slide-left',
          label: t('slideLeft'),
          detail: t('slideLeftDetail'),
          preset: { kind: 'slide', direction: 'left' },
        },
        {
          id: 'slide-right',
          label: t('slideRight'),
          detail: t('slideRightDetail'),
          preset: { kind: 'slide', direction: 'right' },
        },
        { id: 'slide-up', label: t('slideUp'), detail: t('slideUpDetail'), preset: { kind: 'slide', direction: 'up' } },
        {
          id: 'slide-down',
          label: t('slideDown'),
          detail: t('slideDownDetail'),
          preset: { kind: 'slide', direction: 'down' },
        },
        { id: 'zoom-in', label: t('zoomIn'), detail: t('zoomInDetail'), preset: { kind: 'zoom', direction: 'in' } },
        { id: 'zoom-out', label: t('zoomOut'), detail: t('zoomOutDetail'), preset: { kind: 'zoom', direction: 'out' } },
        { id: 'blur', label: t('blur'), detail: t('blurDetail'), preset: { kind: 'blur' } },
      ] as PresetCard[])),
]);
const presetKey = (preset: TransitionPreset | null) => JSON.stringify(preset);
const selected = (card: PresetCard) => presetKey(current.value?.preset ?? null) === presetKey(card.preset);
const choose = (preset: TransitionPreset | null) =>
  emit(
    'update',
    edge.value,
    preset
      ? { preset, durationMs: Math.min(current.value?.durationMs ?? DEFAULT_TRANSITION_DURATION_MS, maxDuration.value) }
      : null,
  );
</script>

<template>
  <section class="transitions-panel" @pointerdown.stop @click.stop>
    <ButtonGroup class="edge-selector" :columns="2" full size="sm" :aria-label="t('clipTransitions')">
      <Button
        v-for="value in ['entry', 'exit'] as const"
        :key="value"
        size="sm"
        :variant="edge === value ? 'secondary' : 'ghost'"
        :aria-pressed="edge === value"
        @click="edge = value"
        >{{ t(value) }}</Button
      >
    </ButtonGroup>

    <div class="duration-control" :class="{ unavailable: !current }">
      <BigSlider
        v-if="current"
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
      <span v-else>{{ t('selectDuration') }}</span>
    </div>

    <div class="preset-gallery" role="radiogroup" :aria-label="t('presetLabel', { edge: t(edge) })">
      <Button
        v-for="card in cards"
        :key="card.id"
        variant="card"
        class="preset-card"
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
          <TransitionPresetPreview :preset="card.preset" :active="hovered === card.id || selected(card)" />
          <span v-if="selected(card)" class="selected-mark"><Check :size="11" stroke-width="2.5" /></span>
        </span>
        <span class="preset-card-info"
          ><strong>{{ card.label }}</strong
          ><small>{{ card.detail }}</small></span
        >
      </Button>
    </div>
  </section>
</template>

<style scoped>
.transitions-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  border-color: var(--color-primary-hover) !important;
}
.preset-card.is-selected,
.preset-card.is-selected:hover {
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 2px var(--color-primary-light) !important;
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
  background: var(--color-primary);
  color: white;
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
.duration-control {
  min-height: 42px;
}
.duration-control.unavailable {
  display: flex;
  align-items: center;
  padding: 0 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 10px;
}
@media (prefers-reduced-motion: reduce) {
  .preset-card {
    transition: none;
  }
}
</style>
