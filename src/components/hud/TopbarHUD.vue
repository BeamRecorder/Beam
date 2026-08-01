<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { ChevronLeft, Minus, Settings, X } from "@lucide/vue";
import Badge from "~/ui/badge/Badge.vue";
import Button from "~/ui/button/Button.vue";
import { useTranslate } from "~/i18n/useTranslate";
import UpdateAvailableBadge from "~/components/updates/UpdateAvailableBadge.vue";

const { t } = useTranslate("TopbarHUD");

withDefaults(
  defineProps<{
    title?: string;
    showBack?: boolean;
    showSettings?: boolean;
    isRecording?: boolean;
  }>(),
  {
    title: "",
    showBack: false,
    showSettings: false,
    isRecording: false,
  },
);

const emit = defineEmits<{
  (event: "back"): void;
  (event: "minimize"): void;
  (event: "open-settings"): void;
  (event: "close"): void;
}>();

const isDragging = ref(false);
let dragElement: HTMLElement | null = null;
let dragPointerId: number | null = null;
let dragStartX = 0;
let dragStartY = 0;
const dragThreshold = 4;
const drag = () => window.capture?.drag();
const handlePointerMove = (event: PointerEvent) => {
  if (dragPointerId !== event.pointerId) return;
  if (!isDragging.value) {
    const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
    if (distance < dragThreshold) return;
    isDragging.value = true;
    window.capture?.dragStart();
  }
  drag();
};
const stopDrag = () => {
  if (isDragging.value) window.capture?.dragEnd();
  isDragging.value = false;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
  if (dragElement && dragPointerId !== null && dragElement.hasPointerCapture?.(dragPointerId)) dragElement.releasePointerCapture?.(dragPointerId);
  dragElement = null;
  dragPointerId = null;
  dragStartX = 0;
  dragStartY = 0;
};
const startDrag = (event: PointerEvent) => {
  if (event.button !== 0) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("button, a, input, select, textarea, [role='button'], .window-actions")) return;
  if (isDragging.value) return;
  dragElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragElement?.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopDrag, { once: true });
  window.addEventListener("pointercancel", stopDrag, { once: true });
};

onBeforeUnmount(stopDrag);
</script>

<template>
  <header class="hud-topbar" :class="{ dragging: isDragging }" @pointerdown="startDrag">
    <div class="topbar-identity">
      <div v-if="showBack" class="topbar-back-action">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="ChevronLeft"
          :aria-label="t('back')"
          @click="emit('back')"
        />
      </div>
      <img
        v-else
        :src="'/brand/DemoRecorderIcon.webp'"
        class="brand-logo"
        :alt="t('title')"
      />
      <span class="topbar-title">{{ title || t('title') }}</span>
      <Badge v-if="isRecording" variant="error" class="rec-badge">{{ t('rec') }}</Badge>
    </div>

    <div class="window-actions">
      <button
        type="button"
        class="window-action"
        :aria-label="t('minimize')"
        @click="emit('minimize')"
      >
        <Minus :size="16" />
      </button>
      <span v-if="showSettings" class="settings-action">
        <Button variant="ghost" size="sm" icon-only :icon="Settings" :aria-label="t('preferences')" @click="emit('open-settings')" />
        <UpdateAvailableBadge />
      </span>
      <button
        type="button"
        class="window-action close-button"
        :aria-label="t('close')"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.hud-topbar {
  height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: no-drag;
  flex-shrink: 0;
  cursor: grab;
}
.hud-topbar:active {
  cursor: grabbing;
}
.hud-topbar.dragging {
  cursor: grabbing;
}
.topbar-identity,
.window-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-action { position: relative; display: inline-flex; }
.window-actions {
  gap: 4px;
  -webkit-app-region: no-drag;
}
.topbar-back-action {
  -webkit-app-region: no-drag;
}
.brand-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.topbar-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
  user-select: none;
  cursor: grab;
}
.rec-badge {
  font-size: 0.6rem;
  padding: 1px 5px;
  user-select: none;
}
.window-action {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.window-action:hover {
  background: var(--color-bg-surface-hover);
}
.window-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.close-button:hover {
  background: var(--color-error) !important;
  color: white !important;
}
.topbar-back-action :deep(.btn) {
  padding: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.topbar-back-action :deep(.btn:hover) {
  background: var(--color-bg-surface-hover);
}
</style>
