<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Copy, ExternalLink, Minus, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { capture } from '~/api/capture';
import type { QuickSnipSnapshot } from '~/api/types/quick-snip';

const status = ref<QuickSnipSnapshot | null>(null);
const compact = ref(false);
const compactHovered = ref(false);
let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
const percent = computed(() => Math.round((status.value?.progress ?? 0) * 100));
const compactView = computed(() => compact.value && !compactHovered.value);
const modeLabel = computed(() => (status.value?.job?.mode === 'raw' ? 'Raw' : 'Studio'));
const statusLabel = computed(() => {
  if (status.value?.state === 'finalizing') return 'Finalizing';
  if (status.value?.state === 'processing') return 'Exporting';
  if (status.value?.state === 'completed') return 'Completed';
  if (status.value?.state === 'failed') return 'Failed';
  return 'Quick Snip';
});

const off = capture.onQuickSnipStatus((next) => {
  status.value = next;
});
const copy = () => status.value?.result?.path && capture.copyQuickSnipFile(status.value.result.path);
const openEditor = async () => {
  const projectId = status.value?.result?.projectId ?? status.value?.job?.projectId;
  if (!projectId) return;
  if (status.value?.state === 'processing') await capture.quickSnipCancel();
  await capture.openEditor(projectId);
};
const toggleCompact = () => {
  compact.value = !compact.value;
  compactHovered.value = false;
  capture.setQuickSnipStatusCompact(compact.value);
};
const showCompactDetails = () => {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
  if (!compact.value || compactHovered.value) return;
  hoverOpenTimer = setTimeout(() => {
    hoverOpenTimer = null;
    compactHovered.value = true;
    capture.setQuickSnipStatusCompact(false);
  }, 100);
};
const hideCompactDetails = () => {
  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
  if (!compact.value || !compactHovered.value) return;
  hoverCloseTimer = setTimeout(() => {
    hoverCloseTimer = null;
    compactHovered.value = false;
    capture.setQuickSnipStatusCompact(true);
  }, 80);
};

onBeforeUnmount(() => {
  if (hoverOpenTimer) clearTimeout(hoverOpenTimer);
  if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
  off();
});
</script>

<template>
  <main
    class="status-shell"
    :class="{ compact: compactView, 'compact-details': compact && compactHovered }"
    @mouseenter="showCompactDetails"
    @mouseleave="hideCompactDetails"
  >
    <section class="status-card">
      <template v-if="compactView">
        <div class="pill-progress" aria-hidden="true"><i :style="{ width: `${percent}%` }" /></div>
        <div class="pill-content">
          <strong>{{ statusLabel }}</strong>
          <span>{{ status?.job?.preset?.name ?? status?.job?.mode ?? 'Quick Snip' }}</span>
          <b>{{ percent }}%</b>
        </div>
      </template>
      <template v-else>
        <div class="thumbnail" aria-hidden="true">
          <img v-if="status?.job?.thumbnail" :src="status.job.thumbnail" alt="" />
          <span v-else>{{ status?.job?.mode === 'raw' ? 'RAW' : 'BEAM' }}</span>
        </div>
        <div class="status-content">
          <strong>{{ status?.job?.preset?.name ?? 'Quick Snip' }}</strong>
          <span>{{ modeLabel }} · {{ statusLabel }} · {{ percent }}%</span>
          <div class="progress"><i :style="{ width: `${percent}%` }" /></div>
          <small v-if="status?.result?.path" :title="status.result.path">{{ status.result.path }}</small>
          <small v-if="status?.error" class="error">{{ status.error }}</small>
        </div>
        <div class="actions">
          <Button
            v-if="!compact"
            size="xs"
            variant="ghost"
            :icon="Minus"
            title="Minimize"
            aria-label="Minimize"
            @click="toggleCompact"
          />
          <Button
            v-if="status?.state === 'processing'"
            size="xs"
            variant="ghost"
            :icon="X"
            title="Cancel"
            aria-label="Cancel"
            @click="capture.quickSnipCancel()"
          />
          <Button
            v-if="status?.result?.path"
            size="xs"
            variant="ghost"
            :icon="Copy"
            title="Copy again"
            aria-label="Copy again"
            @click="copy"
          />
          <Button
            v-if="status?.result?.projectId || (status?.job?.mode === 'studio' && status?.job?.projectId)"
            size="xs"
            variant="ghost"
            :icon="ExternalLink"
            title="Open in Editor"
            aria-label="Open in Editor"
            @click="openEditor"
          />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.status-shell {
  position: fixed;
  inset: 0;
  padding: 12px;
  box-sizing: border-box;
}
.status-card {
  position: relative;
  min-height: 148px;
  display: grid;
  grid-template-columns: 92px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  box-sizing: border-box;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-lg);
  animation: enter 180ms ease-out;
  -webkit-app-region: drag;
  app-region: drag;
  will-change: transform, opacity;
}
.thumbnail {
  width: 92px;
  aspect-ratio: 16 / 10;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
}
.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.status-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--text-primary);
}
.status-content > span,
small {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress {
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-border);
}
.progress i {
  display: block;
  height: 100%;
  background: var(--color-primary);
  transition: width 160ms ease;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.error {
  color: var(--color-danger);
}
.compact .status-card {
  min-height: 56px;
  display: block;
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-full);
}
.pill-progress {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: var(--color-bg-surface);
}
.pill-progress i {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--color-primary) 26%, transparent);
  border-right: 1px solid color-mix(in srgb, var(--color-primary) 74%, transparent);
  transition: width 160ms ease;
}
.pill-content {
  position: relative;
  z-index: 1;
  min-height: 56px;
  padding: 0 18px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
}
.pill-content span {
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill-content b {
  font-variant-numeric: tabular-nums;
}
.compact-details .status-card {
  animation: reveal-details 220ms cubic-bezier(0.16, 1, 0.3, 1);
  transform: translate3d(0, 0, 0);
}
@keyframes reveal-details {
  from {
    opacity: 0.35;
    transform: translate3d(0, 18px, 0) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}
@keyframes enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
</style>
