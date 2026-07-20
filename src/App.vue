<script setup lang="ts">
import { ref } from 'vue'
import HUD from './components/hud/HUD.vue'
import VideoEditor from './components/video-editor/VideoEditor.vue'

const currentView = ref<'hud' | 'editor'>('hud')

const setView = (view: 'hud' | 'editor') => {
  currentView.value = view
  
  if (view === 'editor') {
    window.capture.setSize(760, 480)
  } else {
    window.capture.setSize(320, 480)
  }
}

const handleStartRecording = () => {}

const handleStopRecording = () => {
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
    />

    <VideoEditor 
      v-if="currentView === 'editor'"
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
