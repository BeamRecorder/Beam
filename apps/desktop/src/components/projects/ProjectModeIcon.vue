<script setup lang="ts">
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
withDefaults(defineProps<{ mode?: CaptureMode }>(), { mode: 'studio' });
</script>
<template>
  <CaptureModeIcon :mode="mode" :size="16" class="project-mode-icon" :class="mode" />
</template>
<style scoped>
.project-mode-icon {
  display: block;
  align-self: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}
.studio {
  color: var(--color-track-video);
}
.screenshot {
  color: var(--color-track-audio);
}
.instant {
  color: var(--color-primary);
}
</style>
