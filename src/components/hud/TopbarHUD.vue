<script setup lang="ts">
import { ChevronLeft, Minus, Settings, X } from "@lucide/vue";
import Badge from "~/ui/badge/Badge.vue";
import Button from "~/ui/button/Button.vue";
import { useTranslate } from "~/i18n/useTranslate";
import { resolvePublicAssetUrl } from "~/utils/public-asset";
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

</script>

<template>
  <header class="hud-topbar">
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
        :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')"
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
  -webkit-app-region: drag;
  flex-shrink: 0;
  cursor: grab;
}
.topbar-identity,
.window-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.topbar-identity {
  -webkit-app-region: drag;
}
.settings-action { position: relative; display: inline-flex; }
.settings-action { -webkit-app-region: no-drag; }
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
