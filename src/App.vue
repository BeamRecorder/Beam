<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import HUD from './components/hud/HUD.vue'
import VideoEditor from './components/video-editor/VideoEditor.vue'
import Button from './components/ui/button/Button.vue'

import { capture } from './api/capture'
import type { CaptureProject, ProjectEditorData } from './api/types/capture-api'

const currentView = ref<'hud' | 'editor'>('hud')
const currentVideoSrc = ref<string | null>(null)
const currentProject = ref<CaptureProject | null>(null)
const currentEditorData = ref<ProjectEditorData | null>(null)
const isPreparingEditor = ref(false)
const editorLoadError = ref('')
const EDITOR_WINDOW_SIZE = { width: 1280, height: 800 }

const wait = (durationMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))

const setView = (view: 'hud' | 'editor') => {
  currentView.value = view
  
  if (view === 'editor') {
    capture.setWindowMode('editor')
    capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height)
  } else {
    capture.setWindowMode('hud')
    capture.setSize(320, 480)
  }
}

const revealEditor = async () => {
  capture.setWindowMode('editor')
  capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height)
  capture.present()
  await wait(180)
  currentView.value = 'editor'
  await nextTick()
  isPreparingEditor.value = false
}

const handleStartRecording = () => {
  editorLoadError.value = ''
  currentVideoSrc.value = null
  currentProject.value = null
  currentEditorData.value = null
}

const handleStopRecording = async (session: any) => {
  editorLoadError.value = ''
  isPreparingEditor.value = true
  if (session && session.videoSrc) {
    currentVideoSrc.value = session.videoSrc
  }
  try {
    const projects = await capture.listProjects()
    currentProject.value = projects.find((project) => project.previewSrc === session?.videoSrc)
      ?? projects[0]
      ?? null
    currentEditorData.value = currentProject.value
      ? await capture.getProjectEditorData(currentProject.value.id)
      : null
  } catch {
    currentProject.value = null
    currentEditorData.value = null
  }
  await revealEditor()
}

const handleOpenProject = (project: CaptureProject) => {
  isPreparingEditor.value = true
  editorLoadError.value = ''
  currentProject.value = project
  currentVideoSrc.value = project.previewSrc
  currentEditorData.value = null
  void capture.getProjectEditorData(project.id)
    .then(async (data) => {
      if (currentProject.value?.id !== project.id) return
      currentEditorData.value = data
      await revealEditor()
    })
    .catch((error) => {
      isPreparingEditor.value = false
      editorLoadError.value = error instanceof Error ? error.message : String(error)
      console.error('Failed to load project editor data:', error)
    })
}

const dismissEditorLoadError = () => {
  editorLoadError.value = ''
}
</script>

<template>
  <div class="app-container">
    <!-- View Switcher -->
    <HUD 
      v-show="currentView === 'hud' && !isPreparingEditor && !editorLoadError" 
      @start-recording="handleStartRecording"
      @stop-recording="handleStopRecording"
      @open-project="handleOpenProject"
    />

    <section v-if="isPreparingEditor" class="editor-preparing" aria-live="polite">
      <LoaderCircle class="preparing-spinner" :size="28" />
      <div>
        <p class="preparing-title">Preparing your editor</p>
        <p class="preparing-copy">Finalizing recording and loading your timeline…</p>
      </div>
    </section>

    <section v-else-if="editorLoadError" class="editor-load-error" role="alert">
      <p class="editor-load-error-title">Unable to open this project</p>
      <p>{{ editorLoadError }}</p>
      <Button variant="secondary" size="sm" @click="dismissEditorLoadError">Back to projects</Button>
    </section>

    <Transition name="editor-reveal">
      <VideoEditor 
        v-if="currentView === 'editor' && !isPreparingEditor"
        :video-src="currentVideoSrc"
        :editor-data="currentEditorData"
        :project="currentProject"
        @back-to-hud="setView('hud')"
        @open-project="handleOpenProject"
      />
    </Transition>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: hidden;
}

.editor-preparing {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
}

.editor-load-error {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  text-align: center;
}

.editor-load-error-title {
  font-weight: 700;
}

.preparing-spinner {
  color: var(--color-primary);
  animation: spin 0.85s linear infinite;
}

.preparing-title {
  font-weight: 700;
}

.preparing-copy {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 13px;
}

.editor-reveal-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.editor-reveal-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
