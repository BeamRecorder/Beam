<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check, Copy, ExternalLink, Film, LoaderCircle, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import CopyButton from '~/ui/button/CopyButton.vue';
import { renderQuickSnip } from './quick-snip-export';
import { capture } from '~/api/capture';
import { useTranslate } from '../../i18n/useTranslate';
import type { QuickSnipSnapshot } from '~/api/types/quick-snip';

const { t } = useTranslate('QuickSnipStatus');
const status = ref<QuickSnipSnapshot | null>(null);
const hovered = ref(false);
const focused = ref(false);
const pending = ref(false);
const copied = ref(false);
const actionError = ref('');
const completed = computed(() => status.value?.state === 'completed');
const failed = computed(() => status.value?.state === 'failed');
const percent = computed(() => {
  const value = status.value?.progress;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : 0;
});
const preview = computed(() => status.value?.preview ?? status.value?.job?.thumbnail);
const projectId = computed(() =>
  status.value?.job?.mode === 'studio' ? (status.value.result?.projectId ?? status.value.job.projectId) : null,
);
const label = computed(() => {
  if (failed.value) return t('failed');
  if (completed.value) return copied.value || status.value?.copied ? t('copied') : t('ready');
  return t(status.value?.state === 'processing' ? 'exporting' : 'preparing');
});
const detail = computed(() => {
  if (completed.value) return t('closing');
  if (failed.value) return projectId.value ? t('projectSaved') : t('failed');
  const seconds = status.value?.etaSeconds;
  if (seconds == null || !Number.isFinite(seconds)) return t('estimating');
  return t('remaining', {
    time: seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${Math.max(1, Math.ceil(seconds))} s`,
  });
});
const error = computed(
  () => actionError.value || status.value?.error || (!copied.value && status.value?.clipboardError),
);
const expanded = computed(
  () => hovered.value || focused.value || pending.value || failed.value || Boolean(error.value),
);
let revision = 0;
let lastInteractive = false;
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
const receive = (next: QuickSnipSnapshot) => {
  revision += 1;
  status.value = next;
};
const off = capture.onQuickSnipStatus(receive);
let renderingId: string | null = null;
let renderRevision = 0;
let renderAbort = new AbortController();
const startRender = (task: import('~/api/types/quick-snip').QuickSnipRenderTask | null) => {
  if (!task) {
    renderAbort.abort();
    return;
  }
  if (task.id === renderingId) return;
  renderAbort.abort();
  const abort = new AbortController();
  renderAbort = abort;
  renderingId = task.id;
  void renderQuickSnip(task, abort.signal).catch((reason) => {
    if (!abort.signal.aborted)
      void capture
        .reportQuickSnipRender({
          id: task.id,
          type: 'failed',
          error: reason instanceof Error ? reason.message : String(reason),
        })
        .catch(() => undefined);
  });
};
const offRender = capture.onQuickSnipRenderTask((task) => {
  renderRevision += 1;
  startRender(task);
});
const syncInteractive = () => {
  const value = expanded.value;
  if (lastInteractive === value) return;
  lastInteractive = value;
  capture.setQuickSnipStatusInteractive(value);
};
watch(expanded, syncInteractive, { flush: 'sync' });
const hover = (value: boolean) => {
  if (hoverCloseTimer !== null) clearTimeout(hoverCloseTimer);
  hoverCloseTimer = null;
  if (value) hovered.value = true;
  else {
    // Native drag regions can briefly interrupt mouse events between the pill
    // and its actions. Keep both the panel and native hit testing alive.
    hoverCloseTimer = setTimeout(() => {
      hoverCloseTimer = null;
      hovered.value = false;
    }, 300);
  }
};
const focus = (value: boolean) => {
  focused.value = value;
  syncInteractive();
};
const run = async (action: () => Promise<unknown>) => {
  if (pending.value) return;
  pending.value = true;
  actionError.value = '';
  syncInteractive();
  try {
    await action();
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : t('actionFailed');
  } finally {
    pending.value = false;
    syncInteractive();
  }
};
const copy = () =>
  run(async () => {
    if (!status.value?.result) return;
    await capture.copyQuickSnipFile(status.value.result.path);
    copied.value = true;
  });
const openEditor = () => run(() => capture.openQuickSnipEditor());
const cancel = () => run(() => capture.quickSnipCancel());
const focusOut = (event: FocusEvent) => {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  )
    return;
  focus(false);
};
onMounted(() => {
  const initialRenderRevision = renderRevision;
  void capture
    .getQuickSnipRenderTask()
    .then((task) => {
      if (renderRevision === initialRenderRevision) startRender(task);
    })
    .catch(() => undefined);
  const initialRevision = revision;
  void capture
    .getQuickSnipState()
    .then((next) => {
      if (revision === initialRevision) receive(next);
    })
    .catch(() => {
      actionError.value = t('actionFailed');
    });
});
onBeforeUnmount(() => {
  if (hoverCloseTimer !== null) clearTimeout(hoverCloseTimer);
  renderRevision += 1;
  renderAbort.abort();
  offRender();
  off();
  capture.setQuickSnipStatusInteractive(false);
});
</script>

<template>
  <main class="status-shell" :class="{ expanded, completed, failed, 'opens-below': status?.popoverSide === 'below' }">
    <section
      class="snip-surface"
      @mouseenter="hover(true)"
      @mouseleave="hover(false)"
      @focusin="focus(true)"
      @focusout="focusOut"
    >
      <div class="snip-details" :inert="!expanded" :aria-hidden="!expanded">
        <div v-if="error" class="error-row">
          <p class="status-error" role="alert" :title="error">{{ error }}</p>
          <CopyButton
            :text="error"
            display="icon"
            size="xs"
            variant="ghost"
            tooltip-mode="native"
            :label="t('copyError')"
            :copied-label="t('errorCopied')"
            :error-label="t('copyFailed')"
          />
        </div>
        <div v-else class="preset-label">
          {{ status?.job?.preset.name ?? 'Quick Snip' }} <span>{{ status?.job?.format.toUpperCase() }}</span>
        </div>
        <div class="actions">
          <div v-if="projectId" class="editor-action">
            <Button
              size="xs"
              variant="ghost"
              block
              :icon="ExternalLink"
              :disabled="pending"
              :title="t('openEditor')"
              @click="openEditor"
              >{{ t('openEditor') }}</Button
            >
          </div>
          <Button
            v-if="completed"
            size="xs"
            variant="secondary"
            :icon="copied ? Check : Copy"
            :title="t('copy')"
            :aria-label="t('copy')"
            :disabled="pending"
            @click="copy"
            >{{ t('copy') }}</Button
          >
          <Button v-else-if="!failed" size="xs" variant="ghost" :icon="X" :disabled="pending" @click="cancel">{{
            t('cancel')
          }}</Button>
          <Button
            v-if="completed || failed"
            size="xs"
            variant="ghost"
            :icon="X"
            :aria-label="t('dismiss')"
            :title="t('dismiss')"
            @click="capture.dismissQuickSnipStatus()"
          />
        </div>
      </div>
      <div class="snip-pill" tabindex="0" :aria-label="`${label} ${percent}%`">
        <div class="thumbnail" aria-hidden="true">
          <img v-if="preview" :src="preview" alt="" />
          <Film v-else :size="22" />
          <span v-if="completed" class="success-mark"><Check :size="13" /></span>
        </div>
        <div class="status-copy">
          <strong role="status">{{ label }}</strong>
          <span>{{ detail }}</span>
        </div>
        <div class="status-value">
          <Check v-if="completed" :size="20" />
          <X v-else-if="failed" :size="20" />
          <template v-else
            ><span>{{ percent }}<small>%</small></span
            ><LoaderCircle v-if="percent === 0" class="spinner" :size="12"
          /></template>
        </div>
        <div
          v-if="!completed && !failed"
          class="progress"
          role="progressbar"
          :aria-label="t('exporting')"
          :aria-valuenow="percent"
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <i :style="{ transform: `scaleX(${percent / 100})` }" />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped src="./quick-snip-status.css"></style>
