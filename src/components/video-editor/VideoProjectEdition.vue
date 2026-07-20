<script setup lang="ts">
import { ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import ButtonGroup from '~/ui/button/ButtonGroup.vue'
import Input from '~/ui/input/Input.vue'
import Dialog from '~/ui/dialog/Dialog.vue'
import Divider from '~/ui/divider/Divider.vue'
import ProjectPicker from '../hud/ProjectPicker.vue'
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from '@lucide/vue'
import { capture, type CaptureProject } from '../../capture-api'

const props = withDefaults(
  defineProps<{
    project?: CaptureProject | null
  }>(),
  {
    project: null,
  },
)

const emit = defineEmits<{
  (event: 'open-project', project: CaptureProject): void
}>()

const projectMenuOpen = ref(false)
const projectPickerRef = ref<InstanceType<typeof ProjectPicker> | null>(null)
const isRenameOpen = ref(false)
const renameValue = ref('')
const isDeleteDialogOpen = ref(false)
const projectBusy = ref(false)
const projectError = ref('')

const toggleProjectMenu = () => {
  projectMenuOpen.value = !projectMenuOpen.value
  projectError.value = ''
}

const handleProjectSelected = (project: CaptureProject) => {
  projectMenuOpen.value = false
  emit('open-project', project)
}

const startRename = () => {
  if (!props.project) return
  renameValue.value = props.project.name
  isRenameOpen.value = true
  projectError.value = ''
}

const renameProject = async () => {
  if (!props.project || !renameValue.value.trim()) return
  projectBusy.value = true
  projectError.value = ''
  try {
    const renamedProject = await capture.renameProject(props.project.id, renameValue.value)
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
    projectPickerRef.value?.invalidate()
    projectMenuOpen.value = false
    emit('open-project', createdProject)
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    projectBusy.value = false
  }
}

const deleteProject = async () => {
  if (!props.project) return
  projectBusy.value = true
  projectError.value = ''
  try {
    await capture.deleteProject(props.project.id)
    isDeleteDialogOpen.value = false
    projectPickerRef.value?.invalidate()
    await projectPickerRef.value?.refresh()
    const remainingProjects = await capture.listProjects()
    const nextProject = remainingProjects[0] ?? null
    if (nextProject) emit('open-project', nextProject)
    else projectMenuOpen.value = false
  } catch (error) {
    projectError.value = error instanceof Error ? error.message : String(error)
  } finally {
    projectBusy.value = false
  }
}
</script>

<template>
  <div class="project-switcher" @mousedown.stop>
    <div v-if="isRenameOpen" class="project-name-edit">
      <Input v-model="renameValue" size="sm" width="170px" placeholder="Project name" :disabled="projectBusy" />
      <Button
        variant="primary"
        size="sm"
        icon-only
        :icon="Check"
        :loading="projectBusy"
        tooltip="Save name"
        aria-label="Save project name"
        @click="renameProject"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="X"
        :disabled="projectBusy"
        tooltip="Cancel rename"
        aria-label="Cancel rename"
        @click="isRenameOpen = false"
      />
    </div>
    <Button
      v-else
      variant="ghost"
      size="sm"
      :icon="ChevronDown"
      class="project-name-button"
      :disabled="projectBusy"
      :tooltip="project?.name || 'Untitled project'"
      tooltip-position="bottom"
      aria-haspopup="true"
      :aria-expanded="projectMenuOpen"
      @click="toggleProjectMenu"
    >
      {{ project?.name || 'Untitled project' }}
    </Button>

    <Transition name="project-menu">
      <div v-if="projectMenuOpen" class="project-menu-panel">
        <ProjectPicker
          ref="projectPickerRef"
          compact
          :current-project-id="project?.id"
          @select-project="handleProjectSelected"
        />
        <Divider />
        <div class="project-management">
          <ButtonGroup class="project-management-actions">
            <Button variant="ghost" size="sm" :icon="Pencil" tooltip="Rename project" :disabled="!project || projectBusy" @click="startRename">
              Rename
            </Button>
            <Button variant="ghost" size="sm" :icon="Plus" tooltip="Create a new project" :loading="projectBusy" @click="createProject">
              New project
            </Button>
            <Button variant="danger" size="sm" :icon="Trash2" tooltip="Delete project" :disabled="!project || projectBusy" @click="isDeleteDialogOpen = true">
              Delete
            </Button>
          </ButtonGroup>
          <p v-if="projectError" class="project-management-error" role="alert">{{ projectError }}</p>
        </div>
      </div>
    </Transition>

    <Dialog :is-open="isDeleteDialogOpen" title="Delete project?" size="sm" @close="isDeleteDialogOpen = false">
      <p class="delete-dialog-copy">
        This removes <strong>{{ project?.name }}</strong> and its recordings from disk. This action cannot be undone.
      </p>
      <template #footer>
        <Button variant="ghost" size="sm" @click="isDeleteDialogOpen = false">Cancel</Button>
        <Button variant="danger" size="sm" :loading="projectBusy" @click="deleteProject">Delete project</Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.project-switcher {
  position: relative;
  -webkit-app-region: no-drag;
}

.project-name-edit {
  display: flex;
  align-items: center;
  gap: 4px;
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
  padding: 10px 12px 12px;
}

.project-management-actions {
  width: 100%;
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
</style>
