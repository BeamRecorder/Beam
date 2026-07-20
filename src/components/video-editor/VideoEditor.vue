<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import PropertiesPanel from './properties/PropertiesPanel.vue'
import EditorCanvas from './canvas/EditorCanvas.vue'
import EditorTimeline from './timeline/EditorTimeline.vue'
import Button from '~/ui/button/Button.vue'
import Input from '~/ui/input/Input.vue'
import Dialog from '~/ui/dialog/Dialog.vue'
import Divider from '~/ui/divider/Divider.vue'
import ProjectPicker from '../hud/ProjectPicker.vue'
import { ArrowLeft, ChevronDown, Download, Minus, Pencil, Plus, Trash2, X } from '@lucide/vue'

import { useVideoPlayer } from './composables/useVideoPlayer'
import { useCursorReplacer } from './composables/useCursorReplacer'

const props = withDefaults(
  defineProps<{
    videoSrc?: string | null
    project?: CaptureProject | null
  }>(),
  {
    videoSrc: null,
    project: null,
  }
)

import { capture } from '../../capture-api'
import type { CaptureProject } from '../../capture-api'

const emit = defineEmits<{
  (event: 'back-to-hud'): void
  (event: 'open-project', project: CaptureProject): void
}>()

const activeProject = ref<CaptureProject | null>(null)
const projectMenuOpen = ref(false)
const projectPickerRef = ref<InstanceType<typeof ProjectPicker> | null>(null)
const isRenameOpen = ref(false)
const renameValue = ref('')
const isDeleteDialogOpen = ref(false)
const projectBusy = ref(false)
const projectError = ref('')

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

const toggleProjectMenu = () => {
  projectMenuOpen.value = !projectMenuOpen.value
  projectError.value = ''
}

const handleProjectSelected = (project: CaptureProject) => {
  projectMenuOpen.value = false
  activeProject.value = project
  emit('open-project', project)
}

const startRename = () => {
  if (!activeProject.value) return
  renameValue.value = activeProject.value.name
  isRenameOpen.value = true
  projectError.value = ''
}

const renameProject = async () => {
  if (!activeProject.value || !renameValue.value.trim()) return
  projectBusy.value = true
  projectError.value = ''
  try {
    const renamedProject = await capture.renameProject(activeProject.value.id, renameValue.value)
    activeProject.value = renamedProject
    isRenameOpen.value = false
    emit('open-project', renamedProject)
    await projectPickerRef.value?.refresh()
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    projectBusy.value = false
  }
}

const createProject = async () => {
  projectBusy.value = true
  projectError.value = ''
  try {
    const createdProject = await capture.createProject()
    activeProject.value = createdProject
    projectMenuOpen.value = false
    emit('open-project', createdProject)
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    projectBusy.value = false
  }
}

const deleteProject = async () => {
  if (!activeProject.value) return
  projectBusy.value = true
  projectError.value = ''
  try {
    await capture.deleteProject(activeProject.value.id)
    isDeleteDialogOpen.value = false
    const remainingProjects = await capture.listProjects()
    const nextProject = remainingProjects[0] ?? null
    activeProject.value = nextProject
    if (nextProject) {
      emit('open-project', nextProject)
    } else {
      emit('back-to-hud')
    }
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    projectBusy.value = false
  }
}

const handleExit = () => {
  capture.unmaximize()
  emit('back-to-hud')
}

onMounted(() => {
  activeProject.value = props.project
  playerVideoSrc.value = props.videoSrc ?? ''
  capture.maximize()
})

watch(() => props.videoSrc, (videoSrc) => {
  playerVideoSrc.value = videoSrc ?? ''
})

watch(() => props.project, (project) => {
  activeProject.value = project
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
        <div class="project-switcher" @mousedown.stop>
          <Button
            variant="ghost"
            size="sm"
            :icon="ChevronDown"
            class="project-name-button"
            :disabled="projectBusy"
            aria-haspopup="true"
            :aria-expanded="projectMenuOpen"
            @click="toggleProjectMenu"
          >
            {{ activeProject?.name || 'Untitled project' }}
          </Button>

          <Transition name="project-menu">
            <div v-if="projectMenuOpen" class="project-menu-panel">
              <ProjectPicker
                ref="projectPickerRef"
                compact
                :current-project-id="activeProject?.id"
                @select-project="handleProjectSelected"
              />
              <Divider />
              <div class="project-management">
                <div v-if="isRenameOpen" class="rename-form">
                  <Input v-model="renameValue" placeholder="Project name" :disabled="projectBusy" />
                  <div class="rename-actions">
                    <Button variant="ghost" size="sm" :disabled="projectBusy" @click="isRenameOpen = false">Cancel</Button>
                    <Button variant="primary" size="sm" :loading="projectBusy" @click="renameProject">Save</Button>
                  </div>
                </div>
                <template v-else>
                  <Button variant="ghost" size="sm" :icon="Pencil" :disabled="!activeProject || projectBusy" @click="startRename">
                    Rename
                  </Button>
                  <Button variant="ghost" size="sm" :icon="Plus" :loading="projectBusy" @click="createProject">
                    New project
                  </Button>
                  <Button variant="danger" size="sm" :icon="Trash2" :disabled="!activeProject || projectBusy" class="delete-project-button" @click="isDeleteDialogOpen = true">
                    Delete
                  </Button>
                </template>
                <p v-if="projectError" class="project-management-error" role="alert">{{ projectError }}</p>
              </div>
            </div>
          </Transition>
        </div>
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

    <Dialog :is-open="isDeleteDialogOpen" title="Delete project?" size="sm" @close="isDeleteDialogOpen = false">
      <p class="delete-dialog-copy">
        This removes <strong>{{ activeProject?.name }}</strong> and its recordings from disk. This action cannot be undone.
      </p>
      <template #footer>
        <Button variant="ghost" size="sm" @click="isDeleteDialogOpen = false">Cancel</Button>
        <Button variant="danger" size="sm" :loading="projectBusy" class="delete-project-button" @click="deleteProject">Delete project</Button>
      </template>
    </Dialog>
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

.project-switcher {
  position: relative;
  -webkit-app-region: no-drag;
}

.project-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 100;
  width: 344px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-xl);
}

.project-management {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 12px;
}

.rename-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.project-management-error {
  width: 100%;
  color: var(--color-error);
  font-size: 10px;
  line-height: 1.3;
}

.delete-dialog-copy {
  color: var(--text-secondary);
  line-height: 1.5;
}

.delete-dialog-copy strong {
  color: var(--text-primary);
}

.project-menu-enter-active,
.project-menu-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform-origin: top left;
}

.project-menu-enter-from,
.project-menu-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
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
