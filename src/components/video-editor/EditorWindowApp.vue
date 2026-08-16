<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureProject, PreferenceSettings, ProjectEditorData } from '~/api/types/capture-api';
import type { RecordingConfiguration } from '~/components/hud/recorder/recording-types';
import Button from '~/components/ui/button/Button.vue';
import ToastProvider from '~/components/ui/toast/ToastProvider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { clampTimelineHeight, DEFAULT_TIMELINE_HEIGHT } from './composables/useTimelineResize';
import EditorProjectLoadingOverlay from './EditorProjectLoadingOverlay.vue';
import VideoEditor from './VideoEditor.vue';

const project = ref<CaptureProject | null>(null);
const editorData = ref<ProjectEditorData | null>(null);
const loading = ref(true);
const error = ref('');
const editorGeneration = ref(0);
const loadingTimelineHeight = ref(DEFAULT_TIMELINE_HEIGHT);
let loadGeneration = 0;
let removeContextListener: (() => void) | null = null;
let removePreferencesListener: (() => void) | null = null;
let themeObserver: MutationObserver | null = null;
let nativeEditorReadyNotified = false;
const { t } = useTranslate('EditorPreparingHud');
const EDITOR_READY_PAINT_TIMEOUT_MS = 100;

const syncTitlebarTheme = () => {
  const dark = document.documentElement.classList.contains('dark');
  capture.setEditorTitlebarTheme(dark);
};

const syncTimelineHeight = (preferences: PreferenceSettings) => {
  const savedHeight = Number(preferences.extras?.timelineHeight);
  if (Number.isFinite(savedHeight) && savedHeight > 0) {
    loadingTimelineHeight.value = clampTimelineHeight(savedHeight);
  }
};

const waitForEditorPaint = async () => {
  await nextTick();
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve();
    };

    // Hidden Electron windows may pause requestAnimationFrame indefinitely.
    // Keep the paint opportunity when available, but never let native window
    // presentation depend on a frame that cannot be scheduled.
    timeout = setTimeout(finish, EDITOR_READY_PAINT_TIMEOUT_MS);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    else finish();
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
    editorGeneration.value = generation;
    loading.value = false;
  } catch (reason) {
    if (generation !== loadGeneration) return;
    error.value = reason instanceof Error ? reason.message : String(reason);
    if (!project.value) editorData.value = null;
    loading.value = false;
  }
};

const handleBackToHud = () => {
  capture.setCameraOverlayActive(true);
  capture.showHud();
};

const handleOpenProject = (nextProject: CaptureProject) => {
  loading.value = true;
  void capture.openEditor(nextProject.id).catch((reason) => {
    loading.value = false;
    console.error('Unable to switch editor project.', reason);
  });
};

const handleStartRecording = (configuration: RecordingConfiguration) => {
  capture.startRecordingFromEditor(configuration);
};

const notifyEditorReady = async (generation: number) => {
  if (generation !== loadGeneration || generation !== editorGeneration.value || !project.value) return;
  capture.reportEditorLoadingStage('renderingEditor');
  if (nativeEditorReadyNotified) return;
  nativeEditorReadyNotified = true;
  await waitForEditorPaint();
  capture.notifyEditorReady();
};

onMounted(async () => {
  // The main process creates the window with the persisted theme already
  // applied. Observe subsequent renderer changes, but do not overwrite that
  // native state with the store's temporary light default during hydration.
  themeObserver = new MutationObserver(syncTitlebarTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  removeContextListener = capture.onEditorContext(({ projectId }) => void loadProject(projectId));
  try {
    removePreferencesListener = capture.onPreferencesChanged(syncTimelineHeight);
    void capture
      .getPreferences()
      .then(syncTimelineHeight)
      .catch(() => undefined);
  } catch {
    // The editor remains usable with the default timeline height.
  }
  const context = await capture.getEditorContext();
  if (context) await loadProject(context.projectId);
  else {
    loading.value = false;
    error.value = 'No project selected';
  }
  if (error.value || !project.value) {
    nativeEditorReadyNotified = true;
    capture.reportEditorLoadingStage('renderingEditor');
    await waitForEditorPaint();
    capture.notifyEditorReady();
  }
});

onBeforeUnmount(() => {
  loadGeneration += 1;
  removeContextListener?.();
  removePreferencesListener?.();
  themeObserver?.disconnect();
});
</script>

<template>
  <ToastProvider />
  <main v-if="error && !project" class="editor-window-state" role="alert">
    <p class="state-title">Unable to open this project</p>
    <p>{{ error }}</p>
    <Button variant="secondary" size="sm" @click="handleBackToHud">Back to projects</Button>
  </main>
  <VideoEditor
    v-if="project"
    :key="`${project.id}:${editorGeneration}`"
    :editor-data="editorData"
    :project="project"
    @back-to-hud="handleBackToHud"
    @open-project="handleOpenProject"
    @start-recording="handleStartRecording"
    @ready="notifyEditorReady(editorGeneration)"
  />
  <EditorProjectLoadingOverlay
    :visible="loading"
    :label="t('title')"
    :show-topbar-skeleton="!project"
    :timeline-height="loadingTimelineHeight"
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

.state-title {
  font-weight: 700;
}
</style>
