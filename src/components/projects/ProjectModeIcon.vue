<script setup lang="ts">
import { computed } from 'vue';
import { Clapperboard, ScanLine, Zap } from '@lucide/vue';
import type { CaptureMode } from '~/api/types/capture-mode';
import { useTranslate } from '~/i18n/useTranslate';
const props = withDefaults(defineProps<{ mode?: CaptureMode }>(), { mode: 'studio' });
const { t } = useTranslate('QuickSnipCropBar');
const icon = computed(() => ({ studio: Clapperboard, screenshot: ScanLine, instant: Zap })[props.mode]);
</script>
<template>
  <component :is="icon" class="project-mode-icon" :class="mode" :data-mode="mode" role="img" :aria-label="t(mode)" />
</template>
<style scoped>
.project-mode-icon {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
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
