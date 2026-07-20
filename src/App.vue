<script setup lang="ts">
import { ref } from 'vue'
import HUD from './components/hud/HUD.vue'
import VideoEditor from './components/video-editor/VideoEditor.vue'

import { capture, type CaptureProject } from './capture-api'

const currentView = ref<'hud' | 'editor'>('hud')
const currentVideoSrc = ref<string | null>(null)

const setView = (view: 'hud' | 'editor') => {
  currentView.value = view
  
  if (view === 'editor') {
    capture.setSize(760, 480)
  } else {
    capture.setSize(320, 480)
  }
}

const handleStartRecording = () => {
  currentVideoSrc.value = null
}

const handleStopRecording = (session: any) => {
  if (session && session.videoSrc) {
    currentVideoSrc.value = session.videoSrc
  }
  setView('editor')
}

const handleOpenProject = (project: CaptureProject) => {
  currentVideoSrc.value = project.previewSrc
  setView('editor')
}
</script>

<template>
  <div class="app-container">
    <!-- View Switcher -->
    <HUD 
      v-show="currentView === 'hud'" 
      @start-recording="handleStartRecording"
      @stop-recording="handleStopRecording"
      @open-project="handleOpenProject"
    />

    <VideoEditor 
      v-if="currentView === 'editor'"
      :video-src="currentVideoSrc"
      @back-to-hud="setView('hud')"
    />
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}
</style>
