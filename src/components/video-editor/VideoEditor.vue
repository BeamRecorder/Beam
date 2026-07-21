<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import PropertiesPanel from './properties/PropertiesPanel.vue'
import EditorCanvas from './canvas/EditorCanvas.vue'
import EditorTimeline from './timeline/EditorTimeline.vue'
import Button from '~/ui/button/Button.vue'
import VideoProjectEdition from './VideoProjectEdition.vue'
import { ArrowLeft, Download, Minus, X } from '@lucide/vue'

import { useVideoPlayer } from './composables/useVideoPlayer'
import { useCursorReplacer } from './composables/useCursorReplacer'

const props = withDefaults(
  defineProps<{
    videoSrc?: string | null
    project?: CaptureProject | null
    editorData?: ProjectEditorData | null
  }>(),
  {
    videoSrc: null,
    project: null,
    editorData: null,
  }
)

import { capture } from '../../api/capture'
import type { CaptureProject, ProjectEditorData } from '../../api/types/capture-api'
import type { ZoomElement } from './zoom/zoom-types'
import { buildAutomaticZoomElements, ZOOM_ALGORITHM_VERSION } from './zoom/zoom-suggestions'

const emit = defineEmits<{
  (event: 'back-to-hud'): void
  (event: 'open-project', project: CaptureProject): void
}>()

// Load composables
const {
  isPlaying,
  currentTime,
  duration,
  volume,
  videoSrc: playerVideoSrc,
  selectedBackground,
  selectedBackgroundMedia,
  backgroundGroups,
  isVideoEnabled,
  isSystemAudioEnabled,
  isMicAudioEnabled,
} = useVideoPlayer()

const {
  selectedCursor,
  cursorSize,
  cursorColor,
  enableShadow,
  enableRipple,
} = useCursorReplacer()

const activeTab = ref('cursor')
const zoomElements = ref<ZoomElement[]>([])
const generatedSessions = ref<ProjectEditorData['zoom']['generatedSessions']>([])
const selectedZoomId = ref<string | null>(null)
const selectedZoom = computed(() => zoomElements.value.find((element) => element.id === selectedZoomId.value) ?? null)
const canGenerateZooms = computed(() => Boolean(props.project && props.editorData?.cursor.available && props.editorData.sessionId))
const hasAutomaticZooms = computed(() => zoomElements.value.some((element) => element.mode === 'auto'))

watch(() => props.editorData, (data) => {
  zoomElements.value = data?.zoom.elements ?? []
  generatedSessions.value = data?.zoom.generatedSessions ?? []
  selectedZoomId.value = null
}, { immediate: true })

const saveZoomState = async () => {
  if (!props.project) return
  const zoom = await capture.saveProjectZoomState(props.project.id, {
    elements: JSON.parse(JSON.stringify(zoomElements.value)),
    generatedSessions: JSON.parse(JSON.stringify(generatedSessions.value)),
  })
  zoomElements.value = zoom.elements
  generatedSessions.value = zoom.generatedSessions
}

const generateZooms = async (automatic = false) => {
  const data = props.editorData
  if (!data || !props.project || !data.cursor.available) return
  const durationMs = data.manifest.durationNs / 1_000_000
  const generated = buildAutomaticZoomElements({ telemetry: data.cursor.telemetry, sessionId: data.sessionId, durationMs, reserved: zoomElements.value.filter((element) => element.mode === 'manual') })
  zoomElements.value = [
    ...zoomElements.value.filter((element) => element.sessionId !== data.sessionId || element.mode !== 'auto'),
    ...generated,
  ]
  generatedSessions.value = [
    ...generatedSessions.value.filter((record) => record.sessionId !== data.sessionId),
    { sessionId: data.sessionId, algorithmVersion: ZOOM_ALGORITHM_VERSION, generatedAt: new Date().toISOString() },
  ]
  selectedZoomId.value = generated[0]?.id ?? null
  await saveZoomState()
  if (automatic) activeTab.value = 'zoom'
}

watch(() => props.editorData?.sessionId, (sessionId) => {
  if (!sessionId || !props.editorData || generatedSessions.value.some(
    (record) => record.sessionId === sessionId && record.algorithmVersion >= ZOOM_ALGORITHM_VERSION,
  )) return
  void generateZooms(true).catch((error) => console.error('Failed to generate zooms:', error))
}, { immediate: true })

const updateZoom = (next: ZoomElement) => {
  if (next.startMs < 0 || next.endMs <= next.startMs) return
  zoomElements.value = zoomElements.value.map((element) => element.id === next.id ? next : element)
  void saveZoomState().catch((error) => console.error('Failed to save zoom:', error))
}

const deleteSelectedZoom = () => {
  if (!selectedZoomId.value) return
  zoomElements.value = zoomElements.value.filter((element) => element.id !== selectedZoomId.value)
  selectedZoomId.value = null
  void saveZoomState().catch((error) => console.error('Failed to delete zoom:', error))
}

const handleSelectTab = (tab: string) => {
  activeTab.value = tab
}

const closeApp = () => {
  capture.close()
}

const minimizeApp = () => {
  capture.minimize()
}

const handleExit = () => {
  capture.unmaximize()
  emit('back-to-hud')
}

onMounted(() => {
  playerVideoSrc.value = props.videoSrc ?? ''
  capture.maximize()
})

watch(() => props.videoSrc, (videoSrc) => {
  playerVideoSrc.value = videoSrc ?? ''
})

</script>

<template>
  <div class="editor-page">
    <!-- Window Titlebar / Header -->
    <header class="editor-titlebar" @dblclick="capture.toggleMaximize()">
      <div class="left-actions">
        <Button variant="ghost" size="sm" :icon="ArrowLeft" @click="handleExit" class="exit-btn">
          Exit to HUD
        </Button>
        <VideoProjectEdition :project="project" @open-project="emit('open-project', $event)" @dblclick.stop="capture.toggleMaximize()" />
      </div>

      <div class="right-actions">
        <Button variant="primary" size="sm" :icon="Download" class="export-btn">
          Export Video
        </Button>
        <div class="window-controls">
          <Button variant="ghost" size="sm" icon-only :icon="Minus" tooltip="Minimize" tooltip-position="bottom" aria-label="Minimize" @click="minimizeApp" />
          <Button variant="ghost" size="sm" icon-only :icon="X" tooltip="Close" tooltip-position="bottom" aria-label="Close" class="close-btn" @click="closeApp" />
        </div>
      </div>
    </header>

    <!-- Main Workspace (Islands Layout) -->
    <div class="editor-workspace">
      <!-- Upper Section: Sidebar, Properties, Canvas -->
      <div class="workspace-upper">
        <!-- Sidebar Island -->
        <SidebarPanel 
          :active-tab="activeTab" 
          @select-tab="handleSelectTab" 
        />

        <!-- Properties Island -->
        <PropertiesPanel 
          :active-tab="activeTab"
          
          v-model:selectedCursor="selectedCursor"
          v-model:cursorSize="cursorSize"
          v-model:cursorColor="cursorColor"
          v-model:enableShadow="enableShadow"
          v-model:enableRipple="enableRipple"
          
          v-model:volume="volume"
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
          v-model:selectedBackground="selectedBackground"
          :background-groups="backgroundGroups"
          :selected-zoom="selectedZoom"
          :can-generate-zooms="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          @update:zoom="updateZoom"
          @delete:zoom="deleteSelectedZoom"
          @generate:zooms="generateZooms()"
        />

        <!-- Canvas/Player Island -->
        <EditorCanvas 
          v-model:isPlaying="isPlaying"
          v-model:currentTime="currentTime"
          :duration="duration"
          
          :selected-cursor="selectedCursor"
          :cursor-size="cursorSize"
          :cursor-color="cursorColor"
          :enable-shadow="enableShadow"
          :enable-ripple="enableRipple"
          
          :is-video-enabled="isVideoEnabled"
          :selected-background="selectedBackgroundMedia"
          :video-src="playerVideoSrc || ''"
          :editor-data="editorData"
          :zoom-elements="zoomElements"
          :selected-zoom="selectedZoom"
          @update:zoom="updateZoom"
          @duration-change="duration = $event"
        />
      </div>

      <!-- Lower Section: Timeline (Full width) -->
      <div class="workspace-lower">
        <EditorTimeline 
          v-model:currentTime="currentTime"
          v-model:isPlaying="isPlaying"
          :duration="duration"
          :video-src="playerVideoSrc"
          :editor-data="editorData"
          
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
          :zoom-elements="zoomElements"
          :selected-zoom-id="selectedZoomId"
          @select:zoom="selectedZoomId = $event; activeTab = 'zoom'"
        />
      </div>
    </div>

  </div>
</template>

<style scoped>
.editor-page {
  width: 100vw;
  height: 100vh;
  background: #09090b; /* Deep dark background */
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
  overflow: hidden;
}

.editor-titlebar {
  height: 40px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  padding: 0; /* No padding at all so left and right controls are completely flush */
  display: flex;
  align-items: center;
  justify-content: space-between;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.left-actions, .right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
  height: 100%;
}

.left-actions {
  gap: 8px;
}

.exit-btn {
  margin-right: 4px;
}

.left-actions :deep(.btn-container) {
  height: 100%;
  display: flex;
}

.left-actions :deep(.exit-btn.btn) {
  height: 100%;
  padding: 0 16px;
  border-radius: 0; /* flush to the left corner */
  border: none;
  background: transparent;
  transition: all 0.2s ease;
}

.left-actions :deep(.exit-btn.btn:hover) {
  background: var(--color-bg-surface-hover, rgba(255, 255, 255, 0.05));
  color: var(--text-primary);
}

.right-actions {
  gap: 0; /* No gap so window-controls is flush */
  height: 100%;
}

.export-btn {
  margin-right: 12px; /* Add margin to keep gap from window controls */
}

.window-controls {
  display: flex;
  height: 100%;
  align-items: stretch;
}

.window-controls :deep(.btn-container) {
  height: 100%;
  display: flex;
}

.window-controls :deep(.btn) {
  width: 46px; /* standard windows titlebar button width */
  height: 100%;
  padding: 0;
  border-radius: 0; /* corner to corner */
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  transition: all 0.2s ease;
}

.window-controls :deep(.btn:hover) {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.window-controls :deep(.close-btn:hover) {
  background: var(--color-error) !important;
  color: white !important;
}

/* Islands Workspace Layout */
.editor-workspace {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.workspace-upper {
  flex: 1;
  display: flex;
  gap: 8px; /* 8px gap between Sidebar, Properties & Canvas as requested */
  overflow: hidden;
}

.workspace-lower {
  height: auto;
  flex-shrink: 0;
}
</style>
