<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
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
  selectedWallpaper,
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
    <header class="editor-titlebar">
      <div class="left-actions">
        <Button variant="ghost" size="sm" :icon="ArrowLeft" @click="handleExit" class="exit-btn">
          Exit to HUD
        </Button>
        <VideoProjectEdition :project="project" @open-project="emit('open-project', $event)" />
      </div>

      <div class="right-actions">
        <Button variant="primary" size="sm" :icon="Download" class="export-btn">
          Export Video
        </Button>
        <div class="window-controls">
          <Button variant="ghost" size="sm" icon-only :icon="Minus" tooltip="Minimize" aria-label="Minimize" @click="minimizeApp" />
          <Button variant="ghost" size="sm" icon-only :icon="X" tooltip="Close" aria-label="Close" class="close-btn" @click="closeApp" />
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
          v-model:selectedWallpaper="selectedWallpaper"
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
          :selected-wallpaper="selectedWallpaper"
          :video-src="playerVideoSrc"
          :editor-data="editorData"
          @duration-change="duration = $event"
        />
      </div>

      <!-- Lower Section: Timeline (Full width) -->
      <div class="workspace-lower">
        <EditorTimeline 
          v-model:currentTime="currentTime"
          v-model:isPlaying="isPlaying"
          :duration="duration"
          
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
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
  height: 52px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  padding: 0 16px;
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
}

.window-controls {
  display: flex;
  gap: 4px;
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
