<script setup lang="ts">
import { ref } from 'vue'
import HUD from './components/hud/HUD.vue'
import VideoEditor from './components/video-editor/VideoEditor.vue'

import { capture, type CaptureProject } from './capture-api'

const currentView = ref<'hud' | 'editor'>('hud')
const currentVideoSrc = ref<string | null>(null)
const currentProject = ref<CaptureProject | null>(null)

const setView = (view: 'hud' | 'editor') => {
  currentView.value = view
  
  if (view === 'editor') {
    capture.setSize(760, 480)
  } else {
    capture.setSize(320, 360)
  }
}

const handleStartRecording = () => {
  currentVideoSrc.value = null
  currentProject.value = null
}

const handleStopRecording = async (session: any) => {
  if (session && session.videoSrc) {
    currentVideoSrc.value = session.videoSrc
  }
  try {
    const projects = await capture.listProjects()
    currentProject.value = projects.find((project) => project.previewSrc === session?.videoSrc)
      ?? projects[0]
      ?? null
  } catch {
    currentProject.value = null
  }
  setView('editor')
}

const handleOpenProject = (project: CaptureProject) => {
  currentProject.value = project
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
      :project="currentProject"
      @back-to-hud="setView('hud')"
      @open-project="handleOpenProject"
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
