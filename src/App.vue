<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import HUD from './components/hud/HUD.vue'
import CameraOverlayApp from './components/hud/CameraOverlayApp.vue'
import Button from './components/ui/button/Button.vue'
import RecorderBar from './components/hud/recorder/RecorderBar.vue'
import CountdownOverlay from './components/hud/recorder/CountdownOverlay.vue'
import { useRecordingController } from './components/hud/recorder/useRecordingController'
import type { RecordingConfiguration, RecordingSessionResult } from './components/hud/recorder/recording-types'

import { capture } from './api/capture'
import type { CaptureProject, ProjectEditorData } from './api/types/capture-api'

const INTERACTIVE_SELECTORS = '.hud-wrapper, .camera-overlay-container, .camera-settings-popover, button, a, input, select, textarea, [role="button"], [tabindex], label, video, .popover-content, .popover-trigger, .action-menu-content'
let lastInteractive: boolean | null = null

const handleMouseMove = (e: MouseEvent) => {
  if (currentView.value !== 'hud') return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const isInteractive = el != null && el !== document.documentElement && el !== document.body && el.closest(INTERACTIVE_SELECTORS) != null
  if (isInteractive !== lastInteractive) { lastInteractive = isInteractive; capture.setInteractive(isInteractive) }
}

const handleMouseLeave = () => {
  if (lastInteractive !== false) { lastInteractive = false; capture.setInteractive(false) }
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
  window.addEventListener('mouseleave', handleMouseLeave, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseleave', handleMouseLeave)
})

const currentView = ref<'hud' | 'recorder' | 'editor'>('hud')
const isCameraOverlay = new URLSearchParams(window.location.search).has('cameraOverlay')
const isCountdownOverlay = new URLSearchParams(window.location.search).has('countdown')
const VideoEditor = defineAsyncComponent(() => import('./components/video-editor/VideoEditor.vue'))
const currentVideoSrc = ref<string | null>(null)
const currentProject = ref<CaptureProject | null>(null)
const currentEditorData = ref<ProjectEditorData | null>(null)
const isPreparingEditor = ref(false)
const editorLoadError = ref('')
const EDITOR_WINDOW_SIZE = { width: 1280, height: 800 }

const setView = (view: 'hud' | 'editor') => {
  currentView.value = view
  if (view === 'editor') { capture.setWindowMode('editor'); capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height) } else capture.showHud()
}

const recordingBarVisibility = ref<'always' | 'auto-fade'>(localStorage.getItem('demorecorder_recording_bar_visibility') === 'auto-fade' ? 'auto-fade' : 'always')
const recording = useRecordingController((session) => { void handleStopRecording(session) })

const startRecording = async (configuration: RecordingConfiguration) => {
  editorLoadError.value = ''; currentVideoSrc.value = null; currentProject.value = null; currentEditorData.value = null
  recordingBarVisibility.value = configuration.recordingBarVisibility; currentView.value = 'recorder'; capture.setWindowMode('recorder')
  await recording.start(configuration)
  if (recording.phase.value === 'idle') currentView.value = 'hud'
}

const cancelOrStopRecording = async () => {
  const wasCountdown = recording.phase.value === 'countdown'; await recording.stop()
  if (wasCountdown) { capture.setWindowMode('hud'); capture.setSize(352, 512); currentView.value = 'hud' }
}

const revealEditor = async () => {
  capture.setWindowMode('editor'); capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height)
  currentView.value = 'editor'; isPreparingEditor.value = false; await nextTick(); capture.present()
}

const handleStopRecording = async (session: RecordingSessionResult) => {
  editorLoadError.value = ''; isPreparingEditor.value = true
  if (session && session.videoSrc) currentVideoSrc.value = session.videoSrc
  try {
    const projects = await capture.listProjects()
    currentProject.value = projects.find((project) => project.previewSrc === session?.videoSrc) ?? projects[0] ?? null
    currentEditorData.value = currentProject.value ? await capture.getProjectEditorData(currentProject.value.id) : null
  } catch { currentProject.value = null; currentEditorData.value = null }
  await revealEditor()
}

const handleOpenProject = (project: CaptureProject) => {
  isPreparingEditor.value = true; editorLoadError.value = ''; currentProject.value = project; currentVideoSrc.value = project.previewSrc; currentEditorData.value = null
  void capture.getProjectEditorData(project.id).then(async (data) => {
    if (currentProject.value?.id !== project.id) return
    currentEditorData.value = data; await revealEditor()
  }).catch((error) => {
    isPreparingEditor.value = false; editorLoadError.value = error instanceof Error ? error.message : String(error)
    console.error('Failed to load project editor data:', error)
  })
}

const dismissEditorLoadError = () => { editorLoadError.value = '' }
</script>

<template>
  <CameraOverlayApp v-if="isCameraOverlay" />
  <CountdownOverlay v-else-if="isCountdownOverlay" />
  <div v-else class="app-container">
    <HUD v-if="currentView === 'hud' && !isPreparingEditor && !editorLoadError" @start-recording="startRecording" @open-project="handleOpenProject" />
    <Transition name="recorder-return">
      <RecorderBar v-if="currentView === 'recorder'" :phase="recording.phase.value" :seconds-remaining="recording.secondsRemaining.value" :recording-time="recording.recordingTime.value" :camera-enabled="recording.cameraEnabled.value" :microphone-enabled="recording.microphoneEnabled.value" :system-audio-enabled="recording.systemAudioEnabled.value" :visibility="recordingBarVisibility" @stop="cancelOrStopRecording" @pause="recording.togglePause" @camera="recording.toggleCamera" @microphone="recording.toggleMicrophone" @system-audio="recording.toggleSystemAudio" />
    </Transition>
    <section v-if="isPreparingEditor" class="editor-preparing" aria-live="polite"><LoaderCircle class="preparing-spinner" :size="28" /><div><p class="preparing-title">Preparing your editor</p><p class="preparing-copy">Finalizing recording and loading your timeline…</p></div></section>
    <section v-else-if="editorLoadError" class="editor-load-error" role="alert"><p class="editor-load-error-title">Unable to open this project</p><p>{{ editorLoadError }}</p><Button variant="secondary" size="sm" @click="dismissEditorLoadError">Back to projects</Button></section>
    <Transition name="editor-reveal"><VideoEditor v-if="currentView === 'editor' && !isPreparingEditor" :video-src="currentVideoSrc" :editor-data="currentEditorData" :project="currentProject" @back-to-hud="setView('hud')" @open-project="handleOpenProject" /></Transition>
  </div>
</template>

<style scoped>
.app-container { width: 100vw; height: 100vh; display: flex; align-items: flex-start; justify-content: flex-start; overflow: hidden; }
.editor-preparing { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; gap: 14px; background: var(--color-bg-surface); color: var(--text-primary); }
.editor-load-error { width: 100vw; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; background: var(--color-bg-surface); color: var(--text-primary); text-align: center; }
.editor-load-error-title, .preparing-title { font-weight: 700; }
.preparing-spinner { color: var(--color-primary); animation: spin .85s linear infinite; }
.preparing-copy { margin-top: 2px; color: var(--text-muted); font-size: 13px; }
.editor-reveal-enter-active { transition: opacity .22s ease, transform .22s ease; }
.editor-reveal-enter-from { opacity: 0; transform: translateY(8px); }
.recorder-return-enter-active, .recorder-return-leave-active { transition: opacity .18s ease, transform .18s ease; }
.recorder-return-enter-from, .recorder-return-leave-to { opacity: 0; transform: translateX(8px); }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
