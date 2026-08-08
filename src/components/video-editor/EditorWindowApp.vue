<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { LoaderCircle } from '@lucide/vue';
import { capture } from '~/api/capture';
import type { CaptureProject, ProjectEditorData } from '~/api/types/capture-api';
import type { RecordingConfiguration } from '~/components/hud/recorder/recording-types';
import Button from '~/components/ui/button/Button.vue';
import ToastProvider from '~/components/ui/toast/ToastProvider.vue';
import VideoEditor from './VideoEditor.vue';

const project = ref<CaptureProject | null>(null);
const editorData = ref<ProjectEditorData | null>(null);
const loading = ref(true);
const error = ref('');
let loadGeneration = 0;
let removeContextListener: (() => void) | null = null;
let themeObserver: MutationObserver | null = null;

const syncTitlebarTheme = () => {
  const dark = document.documentElement.classList.contains('dark');
  const surface = document.querySelector<HTMLElement>('.editor-page');
  const surfaceStyle = surface ? window.getComputedStyle(surface) : null;
  console.info('[Beam editor theme] renderer class changed', {
    dark,
    rootBackground: window.getComputedStyle(document.documentElement).backgroundColor,
    surface: surfaceStyle
      ? {
          background: surfaceStyle.backgroundColor,
          display: surfaceStyle.display,
          opacity: surfaceStyle.opacity,
          visibility: surfaceStyle.visibility,
        }
      : null,
  });
  capture.setEditorTitlebarTheme(dark);
};

const waitForEditorPaint = async () => {
  await nextTick();
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
};

const loadProject = async (projectId: string) => {
  const generation = ++loadGeneration;
  loading.value = true;
  error.value = '';
  try {
    capture.reportEditorLoadingStage('loadingProject');
    const projects = await capture.listProjects();
    const nextProject = projects.find((candidate) => candidate.id === projectId) ?? null;
    if (!nextProject) throw new Error('Project not found');
    capture.reportEditorLoadingStage('loadingTimeline');
    const nextEditorData = await capture.getProjectEditorData(projectId);
    if (generation !== loadGeneration) return;
    project.value = nextProject;
    editorData.value = nextEditorData;
  } catch (reason) {
    if (generation !== loadGeneration) return;
    project.value = null;
    editorData.value = null;
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
};

const handleBackToHud = () => {
  capture.setCameraOverlayActive(true);
  capture.showHud();
};

const handleOpenProject = (nextProject: CaptureProject) => {
  void loadProject(nextProject.id);
};

const handleStartRecording = (configuration: RecordingConfiguration) => {
  capture.startRecordingFromEditor(configuration);
};

onMounted(async () => {
  // The main process creates the window with the persisted theme already
  // applied. Observe subsequent renderer changes, but do not overwrite that
  // native state with the store's temporary light default during hydration.
  themeObserver = new MutationObserver(syncTitlebarTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  removeContextListener = capture.onEditorContext(({ projectId }) => void loadProject(projectId));
  const context = await capture.getEditorContext();
  if (context) await loadProject(context.projectId);
  else {
    loading.value = false;
    error.value = 'No project selected';
  }
  capture.reportEditorLoadingStage('renderingEditor');
  await waitForEditorPaint();
  capture.notifyEditorReady();
});

onBeforeUnmount(() => {
  loadGeneration += 1;
  removeContextListener?.();
  themeObserver?.disconnect();
});
</script>

<template>
  <ToastProvider />
  <main v-if="loading" class="editor-window-state" aria-live="polite">
    <LoaderCircle class="state-spinner" :size="28" />
    <p>Preparing your editor…</p>
  </main>
  <main v-else-if="error || !project" class="editor-window-state" role="alert">
    <p class="state-title">Unable to open this project</p>
    <p>{{ error }}</p>
    <Button variant="secondary" size="sm" @click="handleBackToHud">Back to projects</Button>
  </main>
  <VideoEditor
    v-else
    :video-src="project.previewSrc"
    :editor-data="editorData"
    :project="project"
    @back-to-hud="handleBackToHud"
    @open-project="handleOpenProject"
    @start-recording="handleStartRecording"
  />
</template>

<style scoped>
.editor-window-state {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  text-align: center;
}

.state-spinner {
  color: var(--color-primary);
  animation: spin 0.85s linear infinite;
}

.state-title {
  font-weight: 700;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
