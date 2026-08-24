<script setup lang="ts">
import { Captions, Mic, Monitor, Video, Volume2 } from '@lucide/vue';
import type { CaptureProject } from '../../api/types/capture-api';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ project: CaptureProject }>();

const { t } = useTranslate('ProjectPicker');
const { t: tHud } = useTranslate('HUD');
const { t: tCaptions } = useTranslate('CaptionPanel');
</script>

<template>
  <div
    v-if="
      project.hasScreen || project.hasCamera || project.hasCaption || project.hasSystemAudio || project.hasMicrophone
    "
    class="project-badges-overlay"
    data-testid="project-badges"
  >
    <span
      v-if="project.hasScreen"
      class="project-badge-icon"
      :title="t('screenRecord')"
      :aria-label="t('screenRecord')"
    >
      <Monitor />
    </span>
    <span v-if="project.hasCamera" class="project-badge-icon" :title="t('camera')" :aria-label="t('camera')">
      <Video />
    </span>
    <span
      v-if="project.hasSystemAudio"
      class="project-badge-icon"
      :title="tHud('systemAudio')"
      :aria-label="tHud('systemAudio')"
    >
      <Volume2 />
    </span>
    <span
      v-if="project.hasMicrophone"
      class="project-badge-icon"
      :title="tCaptions('microphone')"
      :aria-label="tCaptions('microphone')"
    >
      <Mic />
    </span>
    <span v-if="project.hasCaption" class="project-badge-icon" :title="t('captions')" :aria-label="t('captions')">
      <Captions />
    </span>
  </div>
</template>

<style scoped>
.project-badges-overlay {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  background: rgba(18, 17, 15, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-sm);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

:global(:root.dark) .project-badges-overlay {
  background: rgba(14, 13, 11, 0.65);
  border-color: rgba(255, 255, 255, 0.1);
}

.project-badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f4f4f5;
  opacity: 0.88;
  transition: opacity var(--fast, 0.15s) ease;
}

.project-badge-icon:hover {
  opacity: 1;
}

.project-badge-icon svg {
  width: 11px;
  height: 11px;
}
</style>
