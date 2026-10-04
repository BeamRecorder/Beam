<script setup lang="ts">
import { Pause, Play, RotateCcw, Square, Trash2 } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import type { RecordingBarVisibility, RecordingPhase } from './recording-types';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import Throbber from '~/ui/throbber/Throbber.vue';
import Beamy from '../../brand/Beamy/Beamy.vue';

const { t } = useTranslate('RecorderBar');
const props = withDefaults(
  defineProps<{
    phase: RecordingPhase;
    recordingTime: string;
    visibility: RecordingBarVisibility;
    hoverOnlyActive?: boolean;
    busy?: boolean;
    mascot?: boolean;
    preview?: boolean;
  }>(),
  { busy: false, mascot: false },
);
const emit = defineEmits<{ stop: []; cancel: []; pause: []; restart: [] }>();
const isPointerOver = ref(false);
const isFocused = ref(false);
const confirmingRestart = ref(false);
const restartControl = ref<HTMLElement | null>(null);
const confirmation = ref<HTMLElement | null>(null);
const canPause = computed(() => !props.busy && ['recording', 'paused'].includes(props.phase));
const finalizing = computed(() => props.busy || props.phase === 'finalizing');
const mascotPhase = computed(() =>
  canPause.value ? (props.phase === 'paused' ? 'paused' : 'recording') : 'preparing',
);
const askRestart = async () => {
  if (!canPause.value) return;
  confirmingRestart.value = true;
  await nextTick();
  confirmation.value?.querySelector<HTMLButtonElement>('button')?.focus();
};
const closeConfirmation = async (restart = false) => {
  const accepted = restart && canPause.value;
  confirmingRestart.value = false;
  await nextTick();
  restartControl.value?.querySelector<HTMLButtonElement>('button')?.focus();
  if (accepted) emit('restart');
};
const focusOut = (event: FocusEvent) => {
  isFocused.value =
    event.relatedTarget instanceof Node &&
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.contains(event.relatedTarget);
};
watch(
  () => props.phase,
  () => {
    confirmingRestart.value = false;
  },
);
</script>

<template>
  <aside
    class="recorder-bar"
    :class="{
      'auto-fade': visibility === 'auto-fade',
      'hover-only': visibility === 'hover-only' && hoverOnlyActive,
      'pointer-over': isPointerOver,
      confirming: confirmingRestart,
      'is-preview': preview,
    }"
    :aria-label="t('recordingControls')"
    @pointerenter="isPointerOver = true"
    @pointerleave="isPointerOver = false"
    @focusin="isFocused = true"
    @focusout="focusOut"
    @keydown.esc.prevent="closeConfirmation()"
  >
    <div
      v-if="confirmingRestart"
      ref="confirmation"
      class="restart-prompt"
      role="alertdialog"
      :aria-label="t('restartConfirmation')"
    >
      <p>
        {{ t('restartConfirmation') }}<span>{{ t('restartDescription') }}</span>
      </p>
      <div class="control-slot">
        <Button variant="ghost" size="xs" @click="closeConfirmation()">{{ t('keepRecording') }}</Button>
      </div>
      <div class="control-slot">
        <Button variant="primary" size="xs" :disabled="!canPause" @click="closeConfirmation(true)">{{
          t('restart')
        }}</Button>
      </div>
    </div>
    <template v-else>
      <div class="control-slot">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Trash2"
          :disabled="finalizing"
          :aria-label="t('cancelRecording')"
          :title="t('cancelRecording')"
          @click="emit('cancel')"
        />
      </div>
      <div ref="restartControl" class="control-slot">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="RotateCcw"
          :disabled="!canPause"
          :aria-label="t('restartRecording')"
          :title="t('restartRecording')"
          @click="askRestart"
        />
      </div>
      <div class="control-slot">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="phase === 'paused' ? Play : Pause"
          :disabled="!canPause"
          :aria-label="phase === 'paused' ? t('resumeRecording') : t('pauseRecording')"
          :title="phase === 'paused' ? t('resumeRecording') : t('pauseRecording')"
          @click="emit('pause')"
        />
      </div>
      <p class="recording-time" aria-live="off">
        <template v-if="phase === 'countdown'">{{ t('ready') }}</template>
        <Throbber
          v-else-if="phase === 'starting' || phase === 'finalizing'"
          :text="t('preparing')"
          variant="breathe"
          color="muted"
          size="xs"
        />
        <template v-else>{{ recordingTime }}</template>
      </p>
      <div class="control-slot stop-slot">
        <Button
          variant="secondary"
          size="sm"
          :disabled="finalizing"
          :aria-label="t('stopRecording')"
          :title="t('stopRecording')"
          style="width: 80px; height: 40px; padding: 0; border-radius: var(--radius-full); color: var(--color-error)"
          @click="emit('stop')"
        >
          <template #icon>
            <Beamy
              v-if="mascot"
              :phase="mascotPhase"
              :size="36"
              :active="visibility !== 'hover-only' || !hoverOnlyActive || isPointerOver || isFocused"
            />
            <Square :size="18" aria-hidden="true" />
          </template>
        </Button>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.recorder-bar {
  position: absolute;
  inset: 16px;
  height: 56px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
  transition: opacity 180ms ease;
}
.control-slot {
  display: flex;
  flex: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.recorder-bar.is-preview {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.stop-slot {
  margin-left: auto;
}
.recording-time {
  flex: 1;
  min-width: 0;
  margin: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  white-space: nowrap;
}
.restart-prompt {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.restart-prompt p {
  flex: 1;
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-primary);
}
.restart-prompt p span {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-secondary);
}
.recorder-bar.auto-fade {
  opacity: 0.15;
}
.recorder-bar.hover-only {
  opacity: 0;
}
.recorder-bar:hover,
.recorder-bar.pointer-over,
.recorder-bar:focus-within,
.recorder-bar.confirming {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .recorder-bar {
    transition: none;
  }
}
</style>
