<script setup lang="ts">
import { ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import ProjectPicker from '../hud/ProjectPicker.vue'
import { ChevronDown } from '@lucide/vue'
import type { CaptureProject } from '../../api/types/capture-api'

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

const toggleProjectMenu = () => {
  projectMenuOpen.value = !projectMenuOpen.value
}

const handleProjectSelected = (project: CaptureProject) => {
  projectMenuOpen.value = false
  emit('open-project', project)
}
</script>

<template>
  <div class="project-switcher" @mousedown.stop>
    <Button
      variant="ghost"
      size="sm"
      :icon="ChevronDown"
      class="project-name-button"
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
          compact
          :current-project-id="project?.id"
          @select-project="handleProjectSelected"
          @open-project="handleProjectSelected"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
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
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-xl);
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
