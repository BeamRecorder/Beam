<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import type { CaptureProject } from '~/api/types/capture-api';
import type { HudPanel } from '~/api/types/hud-panel';
import ToastProvider from '~/ui/toast/ToastProvider.vue';
import TopbarHUD from '../hud/TopbarHUD.vue';
import BrandLogo from '../brand/BrandLogo.vue';
const { panel, content } = defineProps<{
  panel: HudPanel | null;
  content: Component | null;
}>();
const { t } = useTranslate('HudPreferences');
const title = panel === 'settings' ? 'Beam Settings' : panel === 'mascot' ? 'Beam Mascot Lab' : 'Beam Projects';
const error = ref('');
const visible = ref(false);
const unsubscribe = capture.onHudPanelVisibility((value) => {
  visible.value = value;
  if (!value) error.value = '';
});
onBeforeUnmount(unsubscribe);
const contentMounted = () => {
  if (panel !== 'settings') capture.notifyHudPanelReady();
};
const openProject = async (project: CaptureProject) => {
  error.value = '';
  try {
    await capture.requestHudProject({
      id: project.id,
      mode: project.mode ?? 'studio',
    });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
};
onMounted(() => {
  document.title = title;
  if (panel) capture.notifyHudPanelPrepared();
});
</script>

<template>
  <main class="panel-window" :class="{ mac: capture.platform === 'darwin' }">
    <TopbarHUD
      v-if="panel === 'projects'"
      symbol="folder"
      :show-settings="false"
      :show-projects="false"
      :show-minimize="false"
      @close="capture.close()"
    />
    <header v-else-if="panel" class="panel-titlebar" :class="{ 'settings-titlebar': panel === 'settings' }">
      <BrandLogo v-if="panel === 'settings'" :title="t('preferences')" symbol="settings" />
      <span v-else>{{ t('mascotLab') }}</span>
    </header>
    <p v-if="error" class="panel-error" role="alert">{{ error }}</p>
    <component
      :is="content"
      v-if="content && visible"
      v-bind="panel === 'mascot' ? { embedded: true } : {}"
      @ready="capture.notifyHudPanelReady()"
      @vue:mounted="contentMounted"
      @open-project="openProject"
    />
    <ToastProvider />
  </main>
</template>

<style scoped>
.panel-window {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--color-bg-surface);
}
.panel-titlebar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 40px;
  padding: 0 150px 0 16px;
  background: var(--color-bg-element);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  -webkit-app-region: drag;
  user-select: none;
}
.mac .panel-titlebar {
  padding-left: 80px;
}
.settings-titlebar {
  height: 38px;
}
.panel-error {
  padding: 12px 16px;
  color: var(--color-error);
  font-size: var(--font-size-body);
}
</style>
