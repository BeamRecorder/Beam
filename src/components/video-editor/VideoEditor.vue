<script setup lang="ts">
import { ref, onMounted } from 'vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import PropertiesPanel from './properties/PropertiesPanel.vue'
import EditorCanvas from './canvas/EditorCanvas.vue'
import EditorTimeline from './timeline/EditorTimeline.vue'
import Button from '~/ui/button/Button.vue'
import { ArrowLeft, Download, Minus, X } from '@lucide/vue'

import { useVideoPlayer } from './composables/useVideoPlayer'
import { useCursorReplacer } from './composables/useCursorReplacer'

const props = withDefaults(
  defineProps<{
    videoSrc?: string | null
  }>(),
  {
    videoSrc: null
  }
)

import { capture } from '../../capture-api'

const emit = defineEmits(['back-to-hud'])

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
  if (props.videoSrc) {
    playerVideoSrc.value = props.videoSrc
  }
  capture.maximize()
})
</script>

<template>
  <div class="editor-page">
    <!-- Window Titlebar / Header -->
    <header class="editor-titlebar">
      <div class="left-actions">
        <Button variant="ghost" size="sm" @click="handleExit" class="exit-btn">
          <template #icon><ArrowLeft class="action-icon" /></template>
          Exit to HUD
        </Button>
      </div>

      <div class="window-title">DemoRecorder - Video Editor</div>

      <div class="right-actions">
        <Button variant="primary" size="sm" class="export-btn">
          <template #icon><Download class="action-icon" /></template>
          Export Video
        </Button>
        <div class="window-controls">
          <Button variant="ghost" size="sm" @click="minimizeApp">
            <template #icon><Minus class="control-icon" /></template>
          </Button>
          <Button variant="ghost" size="sm" class="close-btn" @click="closeApp">
            <template #icon><X class="control-icon" /></template>
          </Button>
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

.window-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
}

.window-controls {
  display: flex;
  gap: 4px;
}

.action-icon {
  width: 14px;
  height: 14px;
}

.control-icon {
  width: 16px;
  height: 16px;
}

.close-btn:hover {
  color: var(--color-error) !important;
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
