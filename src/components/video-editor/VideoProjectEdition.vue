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
    <button
      class="project-name-button"
      :title="project?.name || 'Untitled project'"
      aria-haspopup="true"
      :aria-expanded="projectMenuOpen"
      @click="toggleProjectMenu"
    >
      <span class="project-title">{{ project?.name || 'Untitled project' }}</span>
      <ChevronDown class="chevron-icon" />
    </button>

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

.project-name-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--color-bg-surface, #1e1e24);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 6px);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  max-width: 200px;
}

.project-name-button:hover {
  background: var(--color-bg-surface-hover, #2a2a32);
  border-color: var(--color-border-dark, #3f3f46);
}

.project-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
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
