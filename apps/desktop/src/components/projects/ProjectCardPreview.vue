<script setup lang="ts">
import { ArrowUpRight, Check } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ProgressBar from '~/ui/progressbar/ProgressBar.vue';
import { useTranslate } from '~/i18n/useTranslate';
import ProjectPreviewImage from './ProjectPreviewImage.vue';
import ProjectFeatureBadges from './ProjectFeatureBadges.vue';
import type { ProjectCardPreviewProps } from './project-picker-types';

defineProps<ProjectCardPreviewProps>();
const emit = defineEmits<{ loaded: []; timeupdate: [event: Event]; open: [] }>();
const { t } = useTranslate('ProjectPicker');
</script>

<template>
  <div class="project-preview project-card-media">
    <ProjectPreviewImage :src="thumbnailSrc" :alt="t('preview')" />
    <video
      v-if="project.previewSrc && hovered"
      :src="project.previewSrc"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
      class="project-preview-video"
      :class="{ 'is-loaded': loaded }"
      @loadeddata="emit('loaded')"
      @playing="emit('loaded')"
      @timeupdate="emit('timeupdate', $event)"
    />
    <ProjectFeatureBadges :project="project" />
    <template v-if="!selectionMode">
      <span v-if="current" class="current-indicator" :aria-label="t('current')">{{ t('current') }}</span>
      <span v-else-if="selected" class="selected-indicator" :aria-label="t('selected')"><Check /></span>
      <div class="project-open-overlay" @click.stop @dblclick.stop @keydown.enter.stop @keydown.space.stop>
        <Button size="xs" variant="secondary" :icon="ArrowUpRight" :aria-label="t('openProject')" @click="emit('open')">
          {{ t('openProject') }}
        </Button>
      </div>
    </template>
    <div v-if="project.previewSrc && progress" class="preview-progress-overlay">
      <ProgressBar :value="progress.current" :max="progress.total" />
    </div>
  </div>
</template>

<style scoped>
.project-preview {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  background: var(--color-bg-surface);
  overflow: hidden;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  background-color: transparent;
  transition: opacity 0.2s ease;
  z-index: 3;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
}

.project-preview-video.is-loaded {
  opacity: 1;
}

.project-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-top-left-radius: calc(var(--radius-md) - 1px);
  border-top-right-radius: calc(var(--radius-md) - 1px);
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

.current-indicator {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  z-index: 3;
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

.project-open-overlay {
  position: absolute;
  right: 8px;
  bottom: 10px;
  z-index: 11;
  max-width: calc(100% - 16px);
  opacity: var(--project-open-opacity, 0);
  pointer-events: var(--project-open-pointer-events, none);
  transform: translateY(var(--project-open-offset, 4px));
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.project-preview:hover .project-open-overlay,
.project-preview:focus-within .project-open-overlay {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

@media (hover: none) and (pointer: coarse) {
  .project-open-overlay {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .project-open-overlay {
    transition: none;
    transform: none;
  }
}
</style>
