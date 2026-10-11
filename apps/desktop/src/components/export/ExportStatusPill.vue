<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { FolderOpen, Image, Play, X } from '@lucide/vue';
import StatusPill from '~/ui/status-pill/StatusPill.vue';
import Button from '~/ui/button/Button.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useExportPillMorph } from './useExportPillMorph';
import type { ExportStatusPillProps } from './export-status-types';

const props = withDefaults(defineProps<ExportStatusPillProps>(), {
  kind: 'video',
});
const emit = defineEmits<{ cancel: []; dismiss: [] }>();
const { t } = useTranslate('ExportPopover');
const { t: statusText } = useTranslate('QuickSnipStatus');
const host = ref<HTMLElement | null>(null);
const { ghost, morphing } = useExportPillMorph(host, props.morphFrom);
const hovered = ref(false);
const focused = ref(false);
const pending = ref(false);
const actionError = ref('');
watch(
  () => [props.name, props.state],
  () => {
    if (props.state === 'working') actionError.value = '';
  },
);
const error = computed(() => actionError.value || props.error || '');
const failed = computed(() => props.state === 'failed');
const completed = computed(() => props.state === 'completed');
const expanded = computed(
  () => hovered.value || focused.value || pending.value || failed.value || Boolean(error.value),
);
let dismissTimer: ReturnType<typeof setTimeout> | undefined;
let presentationFrame: number | undefined;
let dismissDeadline: number | null = null;
let remainingMs = 5_000;
let dismissed = false;
const pauseDismissal = () => {
  clearTimeout(dismissTimer);
  if (presentationFrame !== undefined) cancelAnimationFrame(presentationFrame);
  presentationFrame = undefined;
  if (dismissDeadline !== null) remainingMs = Math.max(0, dismissDeadline - performance.now());
  dismissDeadline = null;
};
const dismiss = () => {
  pauseDismissal();
  dismissed = true;
  emit('dismiss');
};
const scheduleDismissal = () => {
  pauseDismissal();
  if (!completed.value || expanded.value || morphing.value || document.hidden || dismissed) return;
  // Wait for a painted completion frame. Finalization may keep the renderer
  // busy after Vue updates the DOM, consuming a timer started synchronously.
  presentationFrame = requestAnimationFrame(() => {
    presentationFrame = requestAnimationFrame(() => {
      presentationFrame = undefined;
      dismissDeadline = performance.now() + remainingMs;
      dismissTimer = setTimeout(dismiss, remainingMs);
    });
  });
};
watch(
  [completed, () => props.name, () => props.filePath],
  () => {
    pauseDismissal();
    remainingMs = 5_000;
    dismissed = false;
    scheduleDismissal();
  },
  { immediate: true, flush: 'sync' },
);
watch([expanded, morphing], scheduleDismissal, { flush: 'post' });
const visibilityChanged = () => {
  pauseDismissal();
  remainingMs = 5_000;
  scheduleDismissal();
};
document.addEventListener('visibilitychange', visibilityChanged);
const percent = computed(() =>
  typeof props.progress === 'number' && Number.isFinite(props.progress)
    ? Math.round(Math.max(0, Math.min(1, props.progress)) * 100)
    : null,
);
const label = computed(() => {
  if (failed.value) return statusText('failed');
  if (completed.value) return statusText(props.kind === 'image' ? 'imageReady' : 'ready');
  return props.stageLabel || statusText(props.kind === 'image' ? 'exportingImage' : 'exporting');
});
const detail = computed(() => props.detail || props.filePath || props.name);
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const hover = (value: boolean) => {
  clearTimeout(closeTimer);
  if (value) hovered.value = true;
  else
    closeTimer = setTimeout(() => {
      hovered.value = false;
      if (!(document.activeElement instanceof HTMLElement) || !document.activeElement.matches(':focus-visible'))
        focused.value = false;
    }, 300);
};
const focusOut = (event: FocusEvent) => {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  )
    return;
  focused.value = false;
};
const open = async (folder: boolean) => {
  if (pending.value || !props.filePath) return;
  pending.value = true;
  actionError.value = '';
  try {
    if (folder) await window.capture?.showItemInFolder(props.filePath);
    else await window.capture?.openFile(props.filePath);
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : statusText('actionFailed');
  } finally {
    pending.value = false;
  }
};
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', visibilityChanged);
  clearTimeout(closeTimer);
  pauseDismissal();
});
</script>

<template>
  <Teleport to="body">
    <div ref="host" class="export-status-host" :class="{ morphing }" :inert="morphing">
      <StatusPill
        :expanded="expanded"
        :completed="completed"
        :failed="failed"
        :label="label"
        :detail="detail"
        :percent="percent"
        :preview="preview"
        mascot
        :mascot-phase="failed ? 'failed' : completed ? 'completed' : 'loading'"
        :job-key="name"
        @mouseenter="hover(true)"
        @mouseleave="hover(false)"
        @focusin="focused = true"
        @focusout="focusOut"
        @dismiss="dismiss"
      >
        <template #value>
          <template v-if="filePath">
            <Button
              size="sm"
              variant="ghost"
              icon-only
              style="width: 44px; height: 44px; padding: 0"
              :icon="kind === 'image' ? Image : Play"
              :disabled="pending"
              :aria-label="t(kind === 'image' ? 'viewImage' : 'watchVideo')"
              :title="t(kind === 'image' ? 'viewImage' : 'watchVideo')"
              @click="open(false)"
            />
            <Button
              size="sm"
              variant="secondary"
              icon-only
              style="width: 44px; height: 44px; padding: 0"
              :icon="FolderOpen"
              :disabled="pending"
              :aria-label="t('openFolder')"
              :title="t('openFolder')"
              @click="open(true)"
            />
          </template>
        </template>
        <template #details>
          <p v-if="error" class="status-error" role="alert" :title="error">
            {{ error }}
          </p>
          <div v-else class="preset-label">
            <span>{{ name }}</span
            ><span>{{ format.toUpperCase() }}</span>
          </div>
          <div class="actions">
            <Button v-if="state === 'working'" size="xs" variant="ghost" :icon="X" @click="emit('cancel')">{{
              t('cancelExport')
            }}</Button>
            <span class="actions-spacer" />
            <CopyButton
              v-if="report || error"
              :text="error ? `${error}\n${report || ''}` : report || ''"
              display="icon"
              size="xs"
              variant="ghost"
              :label="t(error ? 'copyError' : 'copyReport')"
              :copied-label="t('copied')"
              :error-label="t('copyFailed')"
            />
            <Button
              v-if="state !== 'working'"
              size="xs"
              variant="ghost"
              icon-only
              :icon="X"
              :aria-label="statusText('dismiss')"
              :title="statusText('dismiss')"
              @click="dismiss"
            />
          </div>
        </template>
      </StatusPill>
    </div>
    <div
      v-if="morphing && morphFrom"
      :ref="
        (element) => {
          ghost = element as HTMLElement | null;
        }
      "
      class="export-morph-surface"
      aria-hidden="true"
      inert
      :style="{
        left: `${morphFrom.left}px`,
        top: `${morphFrom.top}px`,
        width: `${morphFrom.width}px`,
        height: `${morphFrom.height}px`,
      }"
    />
  </Teleport>
</template>

<style scoped>
.export-status-host {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: min(356px, calc(100vw - 32px));
  z-index: 19000;
  pointer-events: none;
  transition: opacity 140ms ease;
}
.export-status-host.morphing {
  opacity: 0;
}
.export-morph-surface {
  position: fixed;
  z-index: 20000;
  pointer-events: none;
  border: 1px solid var(--color-border);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-lg);
  transform-origin: left top;
  overflow: hidden;
  border-radius: var(--radius-lg);
}
.preset-label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 0 5px 6px;
  font-size: 11px;
  color: var(--text-secondary);
}
.preset-label span:first-child {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.preset-label span:last-child {
  font-size: 10px;
  font-weight: 600;
}
.status-error {
  font-size: 11px;
  color: var(--color-error);
  margin: 0 5px 6px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.actions-spacer {
  flex: 1;
}
@media (max-width: 440px) {
  .export-status-host {
    right: 16px;
    bottom: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .export-status-host {
    transition: none;
  }
}
</style>
