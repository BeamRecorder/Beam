<script setup lang="ts">
import { computed, ref } from 'vue';
import { PanelsTopLeft } from '@lucide/vue';
import type { ClipTransition, ClipTransitions } from '~/media/shared/composition-types';
import { normalizeCanvasTransitions } from '~/media/shared/clip-transitions';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineTransitionCurve from './TimelineTransitionCurve.vue';

const props = defineProps<{
  mode: 'sidebar' | 'track';
  transitions: ClipTransitions;
  durationMs: number;
}>();
const emit = defineEmits<{
  (event: 'open', edge: 'entry' | 'exit'): void;
  (event: 'preview', value: ClipTransitions | null): void;
  (event: 'update', value: ClipTransitions): void;
}>();
const track = ref<HTMLElement | null>(null);
const { t } = useTranslate('TransitionsPanel');
const displayed = ref<ClipTransitions | null>(null);
const activeTransitions = computed(() => displayed.value ?? props.transitions);
const percent = (transition: ClipTransition | null) =>
  `${Math.min(100, ((transition?.durationMs ?? 0) / Math.max(1, props.durationMs)) * 100)}%`;
const label = (edge: 'entry' | 'exit', transition: ClipTransition) => {
  const preset =
    transition.preset.kind === 'slide' || transition.preset.kind === 'zoom'
      ? `${transition.preset.kind} ${transition.preset.direction}`
      : transition.preset.kind;
  return `${t(edge)} · ${preset} · ${transition.durationMs} ms`;
};

const beginResize = (event: PointerEvent, edge: 'entry' | 'exit') => {
  event.preventDefault();
  event.stopPropagation();
  const bounds = track.value?.getBoundingClientRect();
  if (!bounds?.width) return;
  let latest = props.transitions;
  const move = (next: PointerEvent) => {
    const position = Math.max(0, Math.min(bounds.width, next.clientX - bounds.left));
    const durationMs = Math.max(
      1,
      Math.round((edge === 'entry' ? position / bounds.width : 1 - position / bounds.width) * props.durationMs),
    );
    const transition = props.transitions[edge];
    if (!transition) return;
    latest = normalizeCanvasTransitions(
      { ...props.transitions, [edge]: { ...transition, durationMs } },
      props.durationMs,
    );
    displayed.value = latest;
    emit('preview', latest);
  };
  const finish = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    displayed.value = null;
    emit('preview', null);
    if (latest !== props.transitions) emit('update', latest);
  };
  const cancel = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    displayed.value = null;
    emit('preview', null);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish, { once: true });
  window.addEventListener('pointercancel', cancel, { once: true });
};
</script>

<template>
  <div v-if="mode === 'sidebar'" class="canvas-sidebar-row">
    <button type="button" class="canvas-track-info" @click="emit('open', transitions.entry ? 'entry' : 'exit')">
      <PanelsTopLeft class="canvas-track-icon" />
      <span>Canvas</span>
    </button>
  </div>
  <div v-else class="canvas-track-row">
    <div ref="track" class="canvas-track-content">
      <button
        v-if="activeTransitions.entry"
        type="button"
        class="canvas-transition-zone entry"
        :style="{ width: percent(activeTransitions.entry) }"
        :aria-label="label('entry', activeTransitions.entry)"
        @click.stop="emit('open', 'entry')"
      >
        <TimelineTransitionCurve edge="entry" :transition="activeTransitions.entry" />
        <span class="zone-label">{{ t('entry') }} · {{ activeTransitions.entry.durationMs }} ms</span>
        <span class="duration-handle end" @pointerdown="beginResize($event, 'entry')" />
      </button>
      <button
        v-if="activeTransitions.exit"
        type="button"
        class="canvas-transition-zone exit"
        :style="{ width: percent(activeTransitions.exit) }"
        :aria-label="label('exit', activeTransitions.exit)"
        @click.stop="emit('open', 'exit')"
      >
        <TimelineTransitionCurve edge="exit" :transition="activeTransitions.exit" />
        <span class="duration-handle start" @pointerdown="beginResize($event, 'exit')" />
        <span class="zone-label">{{ t('exit') }} · {{ activeTransitions.exit.durationMs }} ms</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas-sidebar-row,
.canvas-track-row {
  display: flex;
  min-height: var(--timeline-track-min-height);
  max-height: var(--timeline-track-max-height);
  flex: 1 1 var(--timeline-track-min-height);
  align-items: center;
  border-bottom: 1px solid var(--color-border);
}
.canvas-sidebar-row {
  background: var(--color-bg-surface);
}
.canvas-track-row {
  background: var(--color-bg-element);
}
.canvas-track-info {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.canvas-track-info:hover {
  background: var(--color-bg-surface-hover);
}
.canvas-track-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
.canvas-track-content {
  position: relative;
  flex: 1;
  height: 100%;
  min-height: var(--timeline-track-min-height);
  margin-inline: 80px 150px;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg-element));
}
.canvas-transition-zone {
  position: absolute;
  inset-block: 3px;
  min-width: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-primary) 58%, var(--color-border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-surface));
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
.canvas-transition-zone:hover,
.canvas-transition-zone:focus-visible {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.canvas-transition-zone.entry {
  left: 0;
}
.canvas-transition-zone.exit {
  right: 0;
}
.zone-label {
  position: relative;
  z-index: 2;
  padding-inline: 5px;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.duration-handle {
  position: absolute;
  inset-block: 0;
  width: 8px;
  cursor: col-resize;
  background: color-mix(in srgb, var(--color-primary) 52%, transparent);
}
.duration-handle.start {
  left: 0;
}
.duration-handle.end {
  right: 0;
}
@media (prefers-reduced-motion: reduce) {
  .canvas-transition-zone {
    transition: none;
  }
}
</style>
