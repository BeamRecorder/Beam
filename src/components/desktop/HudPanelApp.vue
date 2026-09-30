<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import type { CaptureProject } from '~/api/types/capture-api';
import ToastProvider from '~/ui/toast/ToastProvider.vue';
const panel = new URLSearchParams(window.location.search).get('panel');
const { t } = useTranslate('HudPreferences');
const { t: tProjects } = useTranslate('ProjectPicker');
const ProjectPicker = defineAsyncComponent(() => import('../projects/ProjectPicker.vue'));
const HudSettingsWindow = defineAsyncComponent(() => import('../hud/settings/HudSettingsWindow.vue'));
const MascotLab = defineAsyncComponent(() => import('../mascot-lab/MascotLab.vue'));
const title = panel === 'mascot' ? 'Beam Mascot Lab' : panel === 'settings' ? 'Beam Settings' : 'Beam Projects';
const error = ref('');
const openProject = async (project: CaptureProject) => {
  error.value = '';
  try {
    await capture.requestHudProject({ id: project.id, mode: project.mode ?? 'studio' });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
};
onMounted(() => {
  document.title = title;
});
</script>

<template>
  <main class="panel-window" :class="{ mac: capture.platform === 'darwin' }">
    <header class="panel-titlebar">
      {{ panel === 'mascot' ? 'Mascot Lab' : panel === 'settings' ? t('preferences') : tProjects('projects') }}
    </header>
    <p v-if="error" class="panel-error" role="alert">{{ error }}</p>
    <HudSettingsWindow v-if="panel === 'settings'" @ready="capture.notifyHudPanelReady()" />
    <MascotLab
      v-else-if="panel === 'mascot'"
      embedded
      class="panel-content"
      @vue:mounted="capture.notifyHudPanelReady()"
    />
    <ProjectPicker
      v-else-if="panel === 'projects'"
      @vue:mounted="capture.notifyHudPanelReady()"
      @open-project="openProject"
      @back="capture.close()"
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
.panel-error {
  padding: 12px 16px;
  color: var(--color-error);
  font-size: var(--font-size-body);
}
.panel-content {
  flex: 1;
  min-height: 0;
}
</style>
