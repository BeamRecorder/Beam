<script setup lang="ts">
import { ChevronLeft, Minus, Settings, X } from "@lucide/vue";
import Badge from "~/ui/badge/Badge.vue";
import Button from "~/ui/button/Button.vue";

withDefaults(
  defineProps<{
    title?: string;
    showBack?: boolean;
    showSettings?: boolean;
    isRecording?: boolean;
  }>(),
  {
    title: "DemoRecorder",
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
</script>

<template>
  <header class="hud-topbar">
    <div class="topbar-identity">
      <Button
        v-if="showBack"
        variant="ghost"
        size="sm"
        icon-only
        :icon="ChevronLeft"
        aria-label="Back"
        class="topbar-back"
        @click="emit('back')"
      />
      <img
        v-else
        src="/brand/DemoRecorderIcon.webp"
        class="brand-logo"
        alt="DemoRecorder"
      />
      <span class="topbar-title">{{ title }}</span>
      <Badge v-if="isRecording" variant="error" class="rec-badge">REC</Badge>
    </div>

    <div class="window-actions" @mousedown.stop>
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="Minus"
        aria-label="Minimize"
        @click="emit('minimize')"
      />
      <Button
        v-if="showSettings"
        variant="ghost"
        size="sm"
        icon-only
        :icon="Settings"
        aria-label="Preferences"
        @click="emit('open-settings')"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="X"
        aria-label="Close"
        class="close-button"
        @click="emit('close')"
      />
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
  -webkit-app-region: drag;
  flex-shrink: 0;
  cursor: grab;
}
.hud-topbar:active {
  cursor: grabbing;
}
.topbar-identity,
.window-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.window-actions {
  gap: 4px;
  -webkit-app-region: no-drag;
}
.topbar-back {
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
.window-actions :deep(.btn) {
  padding: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.close-button:hover {
  color: var(--color-error) !important;
}
</style>
