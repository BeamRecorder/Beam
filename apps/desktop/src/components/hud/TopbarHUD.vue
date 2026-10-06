<script setup lang="ts">
import { FolderOpen, Minus, Settings, X } from '@lucide/vue';
import { computed, provide, reactive } from 'vue';
import { popoverOpenStateKey } from '~/ui/popover/popover-interaction-types';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import BrandLogo from '../brand/BrandLogo.vue';
import UpdateAvailableBadge from '~/components/updates/UpdateAvailableBadge.vue';
import UpdateShortcut from '~/components/updates/UpdateShortcut.vue';
import type { BrandSymbol } from '../brand/brand-types';

const { t } = useTranslate('TopbarHUD');
const { t: tHud } = useTranslate('HUD');
const openPopovers = reactive(new Set<string>());
provide(popoverOpenStateKey, (id, open) => {
  if (open) openPopovers.add(id);
  else openPopovers.delete(id);
});
const dismissible = computed(() => openPopovers.size > 0);
withDefaults(
  defineProps<{
    title?: string;
    disabled?: boolean;
    showSettings?: boolean;
    showProjects?: boolean;
    showMinimize?: boolean;
    symbol?: BrandSymbol;
  }>(),
  {
    showSettings: true,
    showProjects: true,
    showMinimize: true,
    symbol: 'beam',
  },
);
const emit = defineEmits<{
  'open-settings': [];
  'open-projects': [];
  'popover-toggle': [opened: boolean];
  minimize: [];
  close: [];
}>();
</script>

<template>
  <header class="hud-topbar" :class="{ 'is-dismissible': dismissible }">
    <div class="topbar-identity">
      <BrandLogo :title="title || t('title')" :symbol="symbol" />
    </div>
    <div class="window-actions">
      <UpdateShortcut v-if="showSettings" :disabled="disabled" @toggle="emit('popover-toggle', $event)" />
      <slot name="issues" />
      <Button
        v-if="showProjects"
        variant="ghost"
        size="xs"
        icon-only
        :icon="FolderOpen"
        class="window-action"
        :disabled="disabled"
        :aria-label="tHud('openProject')"
        :title="tHud('openProject')"
        @click="emit('open-projects')"
      />
      <span v-if="showSettings" class="settings-action">
        <Button
          variant="ghost"
          size="xs"
          icon-only
          :icon="Settings"
          class="window-action"
          :disabled="disabled"
          :aria-label="t('preferences')"
          :title="t('preferences')"
          @click="emit('open-settings')"
        />
        <UpdateAvailableBadge />
      </span>
      <Button
        v-if="showMinimize"
        variant="ghost"
        size="xs"
        icon-only
        :icon="Minus"
        class="window-action"
        :aria-label="t('minimize')"
        :title="t('minimize')"
        @click="emit('minimize')"
      />
      <Button
        variant="ghost"
        size="xs"
        icon-only
        :icon="X"
        class="window-action close-button"
        :aria-label="t('close')"
        :title="t('close')"
        @click="emit('close')"
      />
    </div>
  </header>
</template>

<style scoped>
.hud-topbar {
  height: 38px;
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  app-region: drag;
  flex-shrink: 0;
}
.hud-topbar.is-dismissible {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.topbar-identity,
.window-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.topbar-identity {
  flex: 1;
  min-width: 0;
}
.window-actions {
  gap: 2px;
  -webkit-app-region: no-drag;
}
.settings-action {
  position: relative;
  display: inline-flex;
}
.window-actions :deep(.window-action) {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  color: var(--text-primary);
}
.window-actions :deep(.close-button:hover) {
  background: var(--color-error);
  color: var(--text-light);
}
</style>
