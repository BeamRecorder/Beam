<script setup lang="ts">
import { Pause, Play, Square, Trash2, Circle } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import WaveformCanvas from '~/components/video-editor/timeline/waveform/WaveformCanvas.vue';

const props = withDefaults(
  defineProps<{
    phase: 'idle' | 'preparing' | 'countdown' | 'recording' | 'paused' | 'finalizing' | 'error';
    elapsedLabel: string;
    countdownRemaining?: number;
    waveformBars?: number[];
    startLabel: string;
    pauseLabel: string;
    resumeLabel: string;
    stopLabel: string;
    discardLabel: string;
    preparingLabel: string;
    canStart?: boolean;
  }>(),
  { countdownRemaining: 0, waveformBars: () => [], canStart: true },
);

const emit = defineEmits<{
  start: [];
  pause: [];
  resume: [];
  stop: [];
  discard: [];
}>();
</script>

<template>
  <section class="voiceover-control-bar" :data-phase="phase">
    <div class="voiceover-settings"><slot name="settings" /></div>
    <div class="voiceover-waveform" aria-hidden="true">
      <WaveformCanvas :bars="waveformBars" :selected="phase === 'recording'" />
    </div>
    <div class="voiceover-status" aria-live="polite">
      <strong v-if="phase === 'countdown'" class="countdown-value">{{ countdownRemaining }}</strong>
      <Throbber
        v-else-if="phase === 'preparing' || phase === 'finalizing'"
        :text="preparingLabel"
        variant="breathe"
        color="muted"
        size="xs"
      />
      <span v-else class="elapsed-value">{{ elapsedLabel }}</span>
      <slot name="status" />
    </div>
    <div class="voiceover-actions">
      <Button
        v-if="phase === 'idle' || phase === 'error'"
        size="sm"
        :icon="Circle"
        :disabled="!canStart"
        @click="emit('start')"
      >
        {{ startLabel }}
      </Button>
      <Button
        v-else-if="phase === 'recording' || phase === 'paused'"
        variant="danger"
        size="sm"
        :icon="Square"
        @click="emit('stop')"
      >
        {{ stopLabel }}
      </Button>
      <Button
        v-if="phase === 'recording'"
        variant="ghost"
        size="sm"
        :icon="Pause"
        :tooltip="pauseLabel"
        icon-only
        @click="emit('pause')"
      />
      <Button
        v-else-if="phase === 'paused'"
        variant="ghost"
        size="sm"
        :icon="Play"
        :tooltip="resumeLabel"
        icon-only
        @click="emit('resume')"
      />
      <Button
        variant="ghost"
        size="sm"
        :icon="Trash2"
        :tooltip="discardLabel"
        :disabled="phase === 'finalizing'"
        icon-only
        @click="emit('discard')"
      />
    </div>
  </section>
</template>

<style scoped>
.voiceover-control-bar {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  width: min(780px, calc(100vw - 48px));
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
}
.voiceover-settings,
.voiceover-actions,
.voiceover-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.voiceover-waveform {
  height: 34px;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-bg-element);
}
.voiceover-status {
  min-width: 62px;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.countdown-value {
  color: var(--color-primary);
  font-size: 20px;
}
.elapsed-value {
  font-size: 12px;
  font-weight: 700;
}
@media (max-width: 1100px) {
  .voiceover-control-bar {
    grid-template-columns: minmax(180px, 1fr) auto auto;
  }
  .voiceover-waveform {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
