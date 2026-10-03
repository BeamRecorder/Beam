<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { PanelsTopLeft } from '@lucide/vue';
import type { ClipTransition, ClipTransitions } from '@beam/engine/shared/composition-types';
import { normalizeCanvasTransitions } from '@beam/engine/shared/clip-transitions';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineTrimHandle from './TimelineTrimHandle.vue';
import TimelineCanvasLane from './TimelineCanvasLane.vue';
import type { TimelineViewportMetrics } from './composables/timeline-virtualization-types';

const props = defineProps<{
  mode: 'sidebar' | 'track';
  transitions: ClipTransitions;
  durationMs: number;
  width: number;
  viewport: TimelineViewportMetrics;
}>();
const emit = defineEmits<{
  (event: 'open', edge: 'entry' | 'exit'): void;
  (event: 'preview', value: ClipTransitions | null): void;
  (event: 'update', value: ClipTransitions): void;
}>();
const track = ref<HTMLElement | null>(null);
const { t } = useTranslate('TransitionsPanel');
const displayed = ref<ClipTransitions | null>(null);
const resizing = ref<'entry' | 'exit' | null>(null);
const activeTransitions = computed(() => displayed.value ?? props.transitions);
const items = computed(() =>
  (['entry', 'exit'] as const).flatMap((edge) => {
    const transition = activeTransitions.value[edge];
    return transition
      ? [
          {
            transition,
            edge,
            label: `${t(edge)} · ${transition.durationMs} ms`,
            selected: false,
          },
        ]
      : [];
  }),
);
let cancelResize: (() => void) | null = null;
onUnmounted(() => cancelResize?.());
const percent = (transition: ClipTransition) =>
  `${Math.min(100, (transition.durationMs / Math.max(1, props.durationMs)) * 100)}%`;
const label = (edge: 'entry' | 'exit', transition: ClipTransition) => {
  const preset =
    transition.preset.kind === 'slide' || transition.preset.kind === 'zoom'
      ? `${transition.preset.kind} ${transition.preset.direction}`
      : transition.preset.kind;
  return `${t(edge)} · ${preset} · ${transition.durationMs} ms`;
};

const beginResize = (event: PointerEvent, edge: 'entry' | 'exit') => {
  cancelResize?.();
  event.preventDefault();
  event.stopPropagation();
  const bounds = track.value?.getBoundingClientRect();
  if (!bounds?.width) return;
  resizing.value = edge;
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
    window.removeEventListener('blur', cancel);
    cancelResize = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    displayed.value = null;
    resizing.value = null;
    emit('preview', null);
    if (latest !== props.transitions) emit('update', latest);
  };
  const cancel = () => {
    window.removeEventListener('blur', cancel);
    cancelResize = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    displayed.value = null;
    resizing.value = null;
    emit('preview', null);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish, { once: true });
  window.addEventListener('pointercancel', cancel, { once: true });
  window.addEventListener('blur', cancel, { once: true });
  cancelResize = cancel;
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
      <TimelineCanvasLane :items="items" :duration-ms="durationMs" :width="width" :viewport="viewport" />
      <button
        v-if="activeTransitions.entry"
        type="button"
        class="canvas-transition-zone canvas-clip-target entry"
        :style="{ width: percent(activeTransitions.entry) }"
        :aria-label="label('entry', activeTransitions.entry)"
        @click.stop="emit('open', 'entry')"
      >
        <TimelineTrimHandle
          class="duration-handle"
          edge="end"
          :title="label('entry', activeTransitions.entry)"
          :state="resizing === 'entry' ? { edge: 'end', durationMs: activeTransitions.entry.durationMs } : null"
          @start="beginResize($event, 'entry')"
        />
      </button>
      <button
        v-if="activeTransitions.exit"
        type="button"
        class="canvas-transition-zone canvas-clip-target exit"
        :style="{ width: percent(activeTransitions.exit) }"
        :aria-label="label('exit', activeTransitions.exit)"
        @click.stop="emit('open', 'exit')"
      >
        <TimelineTrimHandle
          class="duration-handle"
          edge="start"
          :title="label('exit', activeTransitions.exit)"
          :state="resizing === 'exit' ? { edge: 'start', durationMs: activeTransitions.exit.durationMs } : null"
          @start="beginResize($event, 'exit')"
        />
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
  margin-inline: 80px 150px;
  overflow: hidden;
}
.canvas-transition-zone {
  position: absolute;
  inset-block: 0;
  min-width: 14px;
  overflow: hidden;
  cursor: pointer;
}
.canvas-transition-zone.canvas-clip-target {
  background: transparent;
  border: 0;
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
@media (prefers-reduced-motion: reduce) {
  .canvas-transition-zone {
    transition: none;
  }
}
</style>
<style scoped src="./timeline-item-states.css"></style>
