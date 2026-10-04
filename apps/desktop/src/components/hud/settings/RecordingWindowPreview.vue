<script setup lang="ts">
import { ref } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import HudCaptureCards from '../HudCaptureCards.vue';
import CaptureModeGroup from '../CaptureModeGroup.vue';
import RecorderBar from '../recorder/RecorderBar.vue';
import BrandSymbol from '~/components/brand/BrandSymbol.vue';
import type { RecordingBarVisibility } from '../recorder/recording-types';

withDefaults(
  defineProps<{
    kind: 'window' | 'bar';
    visibility?: RecordingBarVisibility;
  }>(),
  { visibility: 'always' },
);
const { t } = useTranslate('RecorderBar');
const hovering = ref(false);
</script>

<template>
  <div
    class="recording-preview"
    :class="kind"
    aria-hidden="true"
    @pointerenter="hovering = true"
    @pointerleave="hovering = false"
  >
    <div v-if="kind === 'window'" class="hud-scale" inert>
      <div class="preview-topbar">
        <span class="preview-brand"><BrandSymbol symbol="beam" :size="24" />Beam</span
        ><CaptureModeGroup model-value="studio" />
      </div>
      <div class="preview-cards">
        <HudCaptureCards selected="screen" :disabled="false" />
      </div>
    </div>
    <div v-else class="bar-scale" inert>
      <RecorderBar
        preview
        phase="recording"
        :recording-time="t('ready')"
        :visibility="hovering ? 'always' : visibility"
        hover-only-active
      />
    </div>
  </div>
</template>

<style scoped>
.recording-preview {
  position: relative;
  height: 144px;
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-bg-well);
}
.recording-preview.bar {
  height: 96px;
}
.hud-scale,
.bar-scale {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center;
  pointer-events: none;
}
.hud-scale {
  width: 640px;
  transform: translate(-50%, -50%) scale(0.5);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
}
.preview-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-bg-element);
}
.preview-brand {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: var(--weight-display);
  font-size: 18px;
  color: var(--text-primary);
}
.preview-cards {
  padding: 16px;
}
.bar-scale {
  width: 352px;
  height: 88px;
  transform: translate(-50%, -50%) scale(0.85);
}
@media (max-width: 700px) {
  .hud-scale {
    transform: translate(-50%, -50%) scale(0.4);
  }
  .bar-scale {
    transform: translate(-50%, -50%) scale(0.72);
  }
}
@media (prefers-reduced-motion: reduce) {
  .recording-preview {
    transition: none;
  }
}
</style>
