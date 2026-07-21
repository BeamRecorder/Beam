<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import { ArrowLeft, Check, Film, FolderOpen, RefreshCw, MoreVertical, Plus, Pencil, Trash2 } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Dialog from '~/ui/dialog/Dialog.vue'
import Popover from '~/ui/popover/Popover.vue'
import Input from '~/ui/input/Input.vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import ProgressBar from '../ui/progressbar/ProgressBar.vue'
import { capture } from '../../api/capture'
import type { CaptureProject } from '../../api/types/capture-api'

const vFocus = {
  mounted: (el: HTMLElement) => {
    if (el instanceof HTMLInputElement) {
      el.focus()
    } else {
      const input = el.querySelector('input')
      if (input) input.focus()
    }
  },
}

let cachedProjects: CaptureProject[] | null = null

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'open-project', project: CaptureProject): void
  (event: 'select-project', project: CaptureProject): void
  (event: 'toggle-popover', isOpen: boolean): void
}>()

const props = withDefaults(
  defineProps<{
    compact?: boolean
    currentProjectId?: string | null
  }>(),
  {
    compact: false,
    currentProjectId: null,
  },
)

const projects = ref<CaptureProject[]>([])
const selectedProjectId = ref<string | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')

const projectRows = computed(() => {
  const rows: CaptureProject[][] = []
  for (let index = 0; index < projects.value.length; index += 2) {
    rows.push(projects.value.slice(index, index + 2))
  }
  return rows
})

const { list, containerProps, wrapperProps } = useVirtualList(projectRows, {
  itemHeight: () => props.compact ? 120 : 132,
  overscan: 3,
})

const selectedProject = computed(() =>
  projects.value.find((project) => project.id === selectedProjectId.value) ?? null
)

const MIN_SKELETON_DURATION_MS = 180
const wait = (durationMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))

const loadProjects = async () => {
  const startedAt = performance.now()
  isLoading.value = true
  if (cachedProjects) {
    projects.value = [...cachedProjects]
  }
  errorMessage.value = ''
  try {
    const nextProjects = await capture.listProjects()
    cachedProjects = nextProjects
    projects.value = [...nextProjects]
    selectedProjectId.value = projects.value.some((project) => project.id === props.currentProjectId)
      ? props.currentProjectId
      : projects.value[0]?.id ?? null
  } catch (error) {
    projects.value = []
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    await wait(Math.max(0, MIN_SKELETON_DURATION_MS - (performance.now() - startedAt)))
    isLoading.value = false
  }
}

const selectProject = (project: CaptureProject) => {
  selectedProjectId.value = project.id
  if (props.compact) emit('select-project', project)
}

const openSelectedProject = () => {
  if (selectedProject.value) emit('open-project', selectedProject.value)
}

const formatDate = (date: string) => {
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return 'Date inconnue'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsedDate)
}

const setPreviewFrame = (event: Event) => {
  const video = event.currentTarget as HTMLVideoElement | null
  if (video && video.duration > 0) video.currentTime = Math.min(0.1, video.duration)
}

const videoProgress = ref<Record<string, { current: number; total: number }>>({})

const handleVideoTimeUpdate = (projectId: string, event: Event) => {
  const video = event.currentTarget as HTMLVideoElement | null
  if (video) {
    videoProgress.value[projectId] = {
      current: video.currentTime,
      total: video.duration || 1
    }
  }
}

const handleMouseEnterVideo = (_projectId: string, event: MouseEvent) => {
  const video = event.currentTarget as HTMLVideoElement | null
  if (video) {
    video.play().catch(err => console.debug("Play interrupted:", err))
  }
}

const handleMouseLeaveVideo = (projectId: string, event: MouseEvent) => {
  const video = event.currentTarget as HTMLVideoElement | null
  if (video) {
    video.pause()
    video.currentTime = Math.min(0.1, video.duration || 0)
    videoProgress.value[projectId] = { current: 0, total: 1 }
  }
}

onMounted(() => {
  void loadProjects()
})

watch(() => props.currentProjectId, (projectId) => {
  if (projectId && projects.value.some((project) => project.id === projectId)) {
    selectedProjectId.value = projectId
  }
})

// New project states
const isNewProjectOpen = ref(false)
const newProjectName = ref('')
const newProjectError = ref('')
const newProjectBusy = ref(false)

// Rename project states
const renameProjectId = ref('')
const renameValue = ref('')
const renameError = ref('')
const renameBusy = ref(false)

// Delete project states
const isDeleteConfirmOpen = ref(false)
const deleteProjectId = ref('')
const deleteProjectName = ref('')
const deleteError = ref('')
const deleteBusy = ref(false)
const deleteConfirmProjectId = ref<string | null>(null)

const handleActionPopoverToggle = (isOpen: boolean) => {
  if (!isOpen) { deleteConfirmProjectId.value = null; deleteError.value = '' }
  emit('toggle-popover', isOpen)
}

const openNewProjectDialog = () => {
  newProjectName.value = ''
  newProjectError.value = ''
  isNewProjectOpen.value = true
}

const handleCreateProject = async () => {
  newProjectBusy.value = true
  newProjectError.value = ''
  try {
    const created = await capture.createProject({ name: newProjectName.value.trim() || undefined })
    cachedProjects = null
    await loadProjects()
    isNewProjectOpen.value = false
    emit('open-project', created)
  } catch (error) {
    newProjectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    newProjectBusy.value = false
  }
}

const startRename = (project: CaptureProject) => {
  renameProjectId.value = project.id
  renameValue.value = project.name
  renameError.value = ''
}

const cancelRename = () => {
  renameProjectId.value = ''
  renameValue.value = ''
}

const handleRenameProject = async () => {
  const trimmed = renameValue.value.trim()
  const originalProject = projects.value.find(p => p.id === renameProjectId.value)
  if (!trimmed || (originalProject && originalProject.name === trimmed)) {
    cancelRename()
    return
  }
  renameBusy.value = true
  renameError.value = ''
  try {
    await capture.renameProject(renameProjectId.value, trimmed)
    cachedProjects = null
    await loadProjects()
    cancelRename()
  } catch (error) {
    renameError.value = error instanceof Error ? error.message : String(error)
    console.error('Rename failed:', renameError.value)
    cancelRename()
  } finally {
    renameBusy.value = false
  }
}

const confirmDeleteProject = (project: CaptureProject) => {
  deleteProjectId.value = project.id
  deleteProjectName.value = project.name
  deleteError.value = ''
  deleteConfirmProjectId.value = project.id
}

const handleDeleteProject = async () => {
  deleteBusy.value = true
  deleteError.value = ''
  try {
    await capture.deleteProject(deleteProjectId.value)
    cachedProjects = null
    await loadProjects()
    deleteConfirmProjectId.value = null
    
    // If the currently selected project was deleted, pick the first remaining one
    if (selectedProjectId.value === deleteProjectId.value) {
      const remaining = projects.value
      const nextProject = remaining[0] ?? null
      if (nextProject) {
        selectedProjectId.value = nextProject.id
        emit('select-project', nextProject)
      } else {
        selectedProjectId.value = null
      }
    }
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : String(error)
  } finally {
    deleteBusy.value = false
  }
}

const handlePopoverToggle = (isOpen: boolean) => {
  emit('toggle-popover', isOpen)
}

defineExpose({
  refresh: loadProjects,
  invalidate: () => {
    cachedProjects = null
  },
})
</script>

<template>
  <section class="project-picker" :class="{ compact }" aria-labelledby="project-picker-title">
    <div class="project-picker-heading">
      <div>
        <h1 id="project-picker-title">Projects</h1>
        <p>{{ compact ? 'Switch project' : 'Choose a recording to continue editing.' }}</p>
      </div>
      <div class="heading-actions">
        <Button
          variant="ghost"
          size="sm"
          class="new-project-button"
          :icon="Plus"
          icon-only
          aria-label="New project"
          tooltip="New project"
          @click="openNewProjectDialog"
        />
        <Button
          variant="ghost"
          size="sm"
          class="refresh-button"
          :icon="RefreshCw"
          icon-only
          :loading="isLoading"
          aria-label="Refresh projects"
          tooltip="Refresh projects"
          @click="loadProjects"
        />
      </div>
    </div>

    <div v-if="isLoading" class="project-grid project-skeleton-grid" aria-label="Loading projects">
      <div v-for="index in 6" :key="index" class="project-card-skeleton">
        <Skeleton
          class="project-skeleton-preview"
          variant="linear"
          height="72px"
          radius="var(--radius-md) var(--radius-md) 0 0"
        />
        <div class="project-card-skeleton-content">
          <Skeleton class="project-skeleton-line title" variant="linear" width="72%" height="10px" />
          <Skeleton class="project-skeleton-line meta" variant="linear" width="46%" height="8px" />
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="project-state project-error" role="alert">
      <p>{{ errorMessage }}</p>
      <Button variant="link" size="sm" @click="loadProjects">Try again</Button>
    </div>

    <div v-else-if="projects.length === 0" class="project-state">
      <Film class="empty-icon" />
      <p>No projects yet.</p>
      <span>Record a demo first and it will appear here.</span>
    </div>

    <div v-else v-bind="containerProps" class="projects-viewport">
      <div v-bind="wrapperProps" class="projects-list">
        <div v-for="row in list" :key="row.index" class="project-grid project-row">
          <div
            v-for="project in row.data"
            :key="project.id"
            class="project-card-container"
          >
            <Button
              variant="card"
              size="sm"
              block
              class="project-card"
              :class="{ 'is-selected': project.id === selectedProjectId }"
              :aria-pressed="project.id === selectedProjectId"
              @click="selectProject(project)"
              @dblclick="selectProject(project); openSelectedProject()"
            >
              <template #default>
                <div class="project-preview">
                  <video
                    v-if="project.previewSrc"
                    :src="project.previewSrc"
                    muted
                    playsinline
                    preload="metadata"
                    @loadedmetadata="setPreviewFrame"
                    @timeupdate="handleVideoTimeUpdate(project.id, $event)"
                    @mouseenter="handleMouseEnterVideo(project.id, $event)"
                    @mouseleave="handleMouseLeaveVideo(project.id, $event)"
                  />
                  <Film v-else class="preview-placeholder-icon" />
                  <span v-if="project.id === selectedProjectId" class="selected-indicator" aria-label="Selected">
                    <Check />
                  </span>
                  <div v-if="project.previewSrc && videoProgress[project.id]" class="preview-progress-overlay">
                    <ProgressBar :value="videoProgress[project.id].current" :max="videoProgress[project.id].total" />
                  </div>
                </div>
                <div class="project-card-info">
                  <div class="project-title-row">
                    <Input
                      v-if="renameProjectId === project.id"
                      v-focus
                      v-model="renameValue"
                      size="sm"
                      class="project-rename-input"
                      :disabled="renameBusy"
                      @click.stop
                      @mousedown.stop
                      @keydown.enter.stop="handleRenameProject"
                      @keydown.esc.stop="cancelRename"
                      @blur="handleRenameProject"
                    />
                    <span v-else class="project-card-name" :title="project.name">{{ project.name }}</span>
                    <div class="project-card-actions" @click.stop @mousedown.stop>
                      <Popover align="right" direction="down" :match-trigger-width="false" @toggle="handleActionPopoverToggle">
                        <template #trigger="{ isOpen }">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon-only
                            :icon="MoreVertical"
                            class="action-trigger-btn"
                            :class="{ 'is-open': isOpen }"
                          />
                        </template>
                        <template #default="{ close }">
                          <div class="action-menu-content">
                            <template v-if="deleteConfirmProjectId === project.id">
                              <p class="delete-confirm-text">Delete "{{ project.name }}"?</p>
                              <p v-if="deleteError" class="delete-confirm-error">{{ deleteError }}</p>
                              <div class="delete-confirm-actions">
                                <Button variant="ghost" size="sm" :disabled="deleteBusy" @click.stop="deleteConfirmProjectId = null; deleteError = ''">Cancel</Button>
                                <Button variant="danger" size="sm" :loading="deleteBusy" @click.stop="handleDeleteProject">Delete</Button>
                              </div>
                            </template>
                            <template v-else>
                              <Button variant="ghost" size="sm" :icon="Pencil" class="menu-action-item" @click.stop="startRename(project); close()">
                                Rename
                              </Button>
                              <Button variant="ghost" size="sm" :icon="Trash2" class="menu-action-item delete-item" @click.stop="confirmDeleteProject(project)">
                                Delete
                              </Button>
                            </template>
                          </div>
                        </template>
                      </Popover>
                    </div>
                  </div>
                  <span class="project-card-meta">
                    {{ project.sessionCount }} {{ project.sessionCount === 1 ? 'session' : 'sessions' }} · {{ formatDate(project.updatedAt) }}
                  </span>
                </div>
              </template>
            </Button>
          </div>
        </div>
      </div>
    </div>

    <footer v-if="!compact" class="project-picker-footer">
      <ButtonGroup class="project-footer-actions">
        <Button variant="ghost" size="sm" class="back-project-button" :icon="ArrowLeft" @click="emit('back')">
          Back
        </Button>
        <Button variant="primary" size="sm" :icon="FolderOpen" :disabled="!selectedProject" @click="openSelectedProject">
          Open project
        </Button>
      </ButtonGroup>
    </footer>

    <!-- New Project Dialog -->
    <Dialog :is-open="isNewProjectOpen" title="New project" size="sm" @close="isNewProjectOpen = false">
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0;">
        <Input v-model="newProjectName" placeholder="Project name" :disabled="newProjectBusy" autofocus @keyup.enter="handleCreateProject" />
        <p v-if="newProjectError" style="color: var(--color-error); font-size: 11px; margin: 0;">{{ newProjectError }}</p>
      </div>
      <template #footer="{ close }">
        <ButtonGroup>
          <Button variant="ghost" size="sm" :disabled="newProjectBusy" @click="close">Cancel</Button>
          <Button variant="primary" size="sm" :loading="newProjectBusy" @click="handleCreateProject">Create</Button>
        </ButtonGroup>
      </template>
    </Dialog>



  </section>
</template>

<style scoped>
.project-picker {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow: hidden;
}

.project-picker.compact {
  height: 336px;
  flex: none;
  padding: 12px;
  gap: 8px;
}

.project-picker.compact .project-picker-heading h1 {
  font-size: 15px;
}

.project-picker.compact .project-picker-heading p {
  font-size: 10px;
}

.project-picker-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.heading-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.project-picker-heading h1 {
  color: var(--text-primary);
  font-size: 18px;
  letter-spacing: -0.4px;
}

.project-picker-heading p {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.projects-viewport {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 0 -4px;
  padding: 0 4px;
}

.projects-list {
  width: 100%;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.project-row {
  height: 124px;
  margin-bottom: 8px;
}

.compact .project-row {
  height: 112px;
}

.project-card-container {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.project-card,
.project-card-skeleton {
  min-width: 0;
  overflow: visible;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
}

.project-card:hover {
  transform: none !important;
}

.project-card:hover:not(.is-selected) {
  border-color: var(--color-primary-hover) !important;
}

.project-card.is-selected,
.project-card.is-selected:hover {
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 2px var(--color-primary-light) !important;
}

.project-card-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.project-card-container:hover .project-card-actions,
.project-card-actions:focus-within,
.project-card-actions.is-open {
  opacity: 1;
}

.action-trigger-btn {
  width: 18px !important;
  height: 18px !important;
  border-radius: 4px !important;
  background: transparent !important;
  border: none !important;
  color: var(--text-muted) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  box-shadow: none !important;
}

.action-trigger-btn:hover,
.action-trigger-btn.is-open {
  background: var(--color-bg-surface-hover) !important;
  color: var(--text-primary) !important;
}

.action-menu-content {
  display: flex;
  flex-direction: column;
  padding: 4px;
  gap: 2px;
}

.action-menu-content :deep(.btn) {
  width: 100% !important;
  justify-content: flex-start !important;
  padding: 0.4rem 0.8rem !important;
  font-size: 0.8rem !important;
  border-radius: 6px !important;
  border: none !important;
  border-color: transparent !important;
  font-weight: 500 !important;
  box-shadow: none !important;
}

.action-menu-content :deep(.btn:hover) {
  background: var(--color-primary) !important;
  color: white !important;
  border: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.action-menu-content :deep(.delete-item) {
  color: var(--color-error) !important;
}

.action-menu-content :deep(.delete-item:hover) {
  background: var(--color-error) !important;
  color: white !important;
  border: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.delete-confirm-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  padding: 0 2px;
}

.delete-confirm-error {
  font-size: 11px;
  color: var(--color-error);
  margin: 0 0 6px 0;
  padding: 0 2px;
}

.delete-confirm-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.project-preview {
  position: relative;
  height: 72px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--color-bg-surface, #18181b); /* Neutral dark gray/black background instead of blue */
  flex-shrink: 0;
}

.project-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-placeholder-icon {
  width: 22px;
  height: 22px;
  color: var(--text-muted, #71717a); /* Neutral text color */
}

.preview-progress-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.selected-indicator {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  background: var(--color-primary);
}

.selected-indicator svg {
  width: 12px;
  height: 12px;
}

.project-card-info {
  display: flex;
  flex-direction: column;
  padding: 2px 7px 3px;
  min-width: 0;
  width: 100%;
  gap: 0;
  line-height: 1.1;
}

.project-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 4px;
}

.project-card-name,
.project-card-meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
  text-align: left;
}

.project-card-name {
  font-size: 11px;
  font-weight: 700;
  flex: 1;
  line-height: 1.2;
}

.project-rename-input {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  height: 20px !important;
  padding: 0 4px !important;
  border-radius: 4px !important;
  min-width: 0;
}

.project-rename-input :deep(.input-element) {
  font-size: 11px !important;
  font-weight: 700 !important;
}

.project-card-meta {
  padding-top: 0;
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.1;
}

.project-skeleton-grid {
  flex: 1;
  align-content: start;
  overflow: hidden;
}

.project-card-skeleton {
  height: 124px;
}

.project-card-skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
}

.project-skeleton-preview {
  display: block;
}

.project-skeleton-line {
  display: block;
}

.project-state {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

.project-state span {
  font-size: 10px;
}

.project-error p {
  max-width: 240px;
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.35;
}

.empty-icon {
  width: 24px;
  height: 24px;
  margin-bottom: 3px;
  color: var(--text-muted);
}

.project-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.project-footer-actions {
  width: 100%;
}

.back-project-button {
  padding-left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .project-card {
    animation: none;
    transition: none;
  }
}
</style>
