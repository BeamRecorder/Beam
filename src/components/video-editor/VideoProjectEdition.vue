<script setup lang="ts">
import { defineAsyncComponent, ref, watch, nextTick, onMounted, onUnmounted, useId } from 'vue';
import ProjectModeIcon from '../projects/ProjectModeIcon.vue';
import type { ProjectIdentity } from '../projects/project-picker-types';
import { ChevronDown, LoaderCircle } from '@lucide/vue';
import type { CaptureProject } from '../../api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';

const { t } = useTranslate('VideoProjectEdition');
const { t: pickerText } = useTranslate('ProjectPicker');
const ProjectPicker = defineAsyncComponent(() => import('../projects/ProjectPicker.vue'));
const props = withDefaults(
  defineProps<{ project?: ProjectIdentity | null; disabled?: boolean; isSaving?: boolean }>(),
  { project: null, isSaving: false },
);
const emit = defineEmits<{
  (event: 'open-project', project: CaptureProject): void;
  (event: 'rename-project', project: CaptureProject): void;
  (event: 'delete-project', project: CaptureProject): void;
}>();
const projectTitle = ref(props.project?.name);
const picker = ref<InstanceType<typeof Popover> | null>(null);
const switcher = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const panelId = useId();
const panelGap = ref(4);
let titlebarObserver: ResizeObserver | null = null;
const updatePanelGap = () => {
  const header = switcher.value?.closest('header');
  const trigger = switcher.value?.querySelector('button');
  if (header && trigger)
    panelGap.value = Math.max(0, header.getBoundingClientRect().bottom - trigger.getBoundingClientRect().bottom);
};
watch(
  () => props.project?.name,
  (name) => {
    projectTitle.value = name;
  },
);
const handleProjectRenamed = (project: CaptureProject) => {
  if (props.project?.id === project.id) projectTitle.value = project.name;
  emit('rename-project', project);
};
const handleProjectSelected = (project: CaptureProject) => {
  picker.value?.close();
  if (props.project?.id !== project.id) emit('open-project', project);
};
const focusPicker = (event: MouseEvent) => {
  updatePanelGap();
  if (event.detail === 0 && !props.disabled) void nextTick(() => panel.value?.focus());
};
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !picker.value?.isOpen || event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('.dialog-overlay')) return;
  const content = target?.closest('.popover-content');
  if (content && !content.contains(panel.value)) return;
  event.preventDefault();
  picker.value.close();
  switcher.value?.querySelector<HTMLButtonElement>('button')?.focus();
};
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  updatePanelGap();
  if (typeof ResizeObserver !== 'undefined' && switcher.value) {
    titlebarObserver = new ResizeObserver(updatePanelGap);
    const header = switcher.value.closest('header');
    if (header) titlebarObserver.observe(header);
    if (switcher.value.parentElement) titlebarObserver.observe(switcher.value.parentElement);
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  titlebarObserver?.disconnect();
});
</script>

<template>
  <div ref="switcher" class="project-switcher">
    <Popover
      ref="picker"
      block
      align="center"
      surface="attached"
      flush
      :gap="panelGap"
      :match-trigger-width="false"
      :close-on-window-blur="false"
      :disabled="disabled"
    >
      <template #trigger="{ isOpen }">
        <Button
          class="project-name-button"
          variant="ghost"
          size="sm"
          block
          :disabled="disabled"
          :title="projectTitle || t('untitledProject')"
          aria-haspopup="dialog"
          :aria-controls="isOpen ? panelId : undefined"
          :aria-expanded="isOpen"
          style="height: 32px; padding: 0 4px; border: 0; background: transparent; font-weight: 500"
          @click="focusPicker"
        >
          <template #icon><ProjectModeIcon :mode="project?.mode" /></template>
          <span class="project-label">
            <span class="project-title">{{ projectTitle || t('untitledProject') }}</span>
            <LoaderCircle v-if="isSaving" class="save-spinner" :aria-label="t('savingProject')" />
            <ChevronDown class="chevron-icon" :class="{ 'is-open': isOpen }" aria-hidden="true" />
          </span>
        </Button>
      </template>
      <section
        ref="panel"
        :id="panelId"
        class="project-menu-panel"
        role="dialog"
        :aria-label="pickerText('projects')"
        tabindex="-1"
      >
        <ProjectPicker
          compact
          :current-project-id="project?.id"
          @select-project="handleProjectSelected"
          @open-project="handleProjectSelected"
          @rename-project="handleProjectRenamed"
          @delete-project="emit('delete-project', $event)"
        />
      </section>
    </Popover>
  </div>
</template>

<style scoped>
.project-switcher {
  min-width: 0;
  max-width: 100%;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.project-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.project-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron-icon,
.save-spinner {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex: none;
}
.chevron-icon {
  transition: transform 150ms ease;
}
.chevron-icon.is-open {
  transform: rotate(180deg);
}
.save-spinner {
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.project-menu-panel {
  width: min(720px, calc(100vw - 32px));
  --project-picker-height: min(440px, calc(100vh - 96px));
  outline: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
@media (prefers-reduced-motion: reduce) {
  .chevron-icon {
    transition: none;
  }
  .save-spinner {
    animation: none;
  }
}
</style>
