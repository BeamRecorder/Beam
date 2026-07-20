<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import { ArrowLeft, Check, Film, FolderOpen, RefreshCw } from '@lucide/vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Skeleton from '~/ui/skeleton/Skeleton.vue'
import { capture } from '../../api/capture'
import type { CaptureProject } from '../../api/types/capture-api'

let cachedProjects: CaptureProject[] | null = null

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'open-project', project: CaptureProject): void
  (event: 'select-project', project: CaptureProject): void
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

const loadProjects = async () => {
  if (cachedProjects) {
    projects.value = [...cachedProjects]
    isLoading.value = false
  } else {
    isLoading.value = true
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

onMounted(() => {
  void loadProjects()
})

watch(() => props.currentProjectId, (projectId) => {
  if (projectId && projects.value.some((project) => project.id === projectId)) {
    selectedProjectId.value = projectId
  }
})

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
        <h1 id="project-picker-title">{{ compact ? 'Projects' : 'Open a project' }}</h1>
        <p>{{ compact ? 'Switch project' : 'Choose a recording to continue editing.' }}</p>
      </div>
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

    <div v-if="isLoading" class="project-grid project-skeleton-grid" aria-label="Loading projects">
      <div v-for="index in 6" :key="index" class="project-card-skeleton">
        <Skeleton variant="linear" width="100%" height="72px" radius="var(--radius-md) var(--radius-md) 0 0" />
        <div class="project-card-skeleton-content">
          <Skeleton variant="linear" width="72%" height="11px" />
          <Skeleton variant="linear" width="46%" height="9px" />
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
          <Button
            v-for="project in row.data"
            :key="project.id"
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
                />
                <Film v-else class="preview-placeholder-icon" />
                <span v-if="project.id === selectedProjectId" class="selected-indicator" aria-label="Selected">
                  <Check />
                </span>
              </div>
              <span class="project-card-name">{{ project.name }}</span>
              <span class="project-card-meta">
                {{ project.sessionCount }} {{ project.sessionCount === 1 ? 'session' : 'sessions' }} · {{ formatDate(project.updatedAt) }}
              </span>
            </template>
          </Button>
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

.project-picker-heading h1 {
  color: var(--color-dark-blue);
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

.project-card,
.project-card-skeleton {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
}

.project-preview {
  position: relative;
  height: 72px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #10131b;
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
  color: #71798a;
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
  background: var(--color-orange);
}

.selected-indicator svg {
  width: 12px;
  height: 12px;
}

.project-card-name,
.project-card-meta {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.project-card-name {
  padding: 6px 7px 0;
  font-size: 11px;
  font-weight: 700;
}

.project-card-meta {
  padding: 2px 7px 6px;
  color: var(--text-muted);
  font-size: 9px;
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
