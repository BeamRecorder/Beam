<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ProjectPicker from '../hud/ProjectPicker.vue'
import { ChevronDown, LoaderCircle } from '@lucide/vue'
import type { CaptureProject } from '../../api/types/capture-api'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('VideoProjectEdition')

const props = withDefaults(
  defineProps<{
    project?: CaptureProject | null
    isSaving?: boolean
  }>(),
  {
    project: null,
    isSaving: false,
  },
)

const emit = defineEmits<{
  (event: 'open-project', project: CaptureProject): void
}>()

const projectMenuOpen = ref(false)
const switcherRef = ref<HTMLDivElement | null>(null)

const toggleProjectMenu = () => {
  projectMenuOpen.value = !projectMenuOpen.value
}

const handleProjectSelected = (project: CaptureProject) => {
  projectMenuOpen.value = false
  emit('open-project', project)
}

const handleWindowPointerDown = (event: MouseEvent | PointerEvent) => {
  if (!projectMenuOpen.value) return
  const target = event.target as Element | null
  if (target?.closest('.popover-content') || target?.closest('.dialog-overlay') || target?.closest('.dialog-container')) {
    return
  }
  if (switcherRef.value && !switcherRef.value.contains(target as Node)) {
    projectMenuOpen.value = false
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && projectMenuOpen.value) {
    projectMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleWindowPointerDown, { capture: true })
  window.addEventListener('mousedown', handleWindowPointerDown, { capture: true })
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown, { capture: true })
  window.removeEventListener('mousedown', handleWindowPointerDown, { capture: true })
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div ref="switcherRef" class="project-switcher">
    <button
      class="project-name-button"
      :title="project?.name || t('untitledProject')"
      aria-haspopup="true"
      :aria-expanded="projectMenuOpen"
      @click="toggleProjectMenu"
    >
      <span class="project-title">{{ project?.name || t('untitledProject') }}</span>
      <LoaderCircle class="save-spinner" :class="{ 'is-visible': isSaving }" :aria-label="t('savingProject')" />
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
.save-spinner {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.save-spinner.is-visible {
  visibility: visible;
  opacity: 1;
  animation: spin 700ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

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
