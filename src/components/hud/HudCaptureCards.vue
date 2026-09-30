<script setup lang="ts">
import { Crop, Monitor, PanelsTopLeft } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { HudCaptureTarget } from './hud-state-types';

defineProps<{ selected: HudCaptureTarget; disabled: boolean }>();
const emit = defineEmits<{ choose: [target: HudCaptureTarget] }>();
const { t } = useTranslate('HUD');
const targets = [
  { id: 'screen', label: 'fullScreen', icon: Monitor, wallpaper: 'sequoia-blue.webp' },
  { id: 'region', label: 'region', icon: Crop, wallpaper: 'ventura-dark.webp' },
  { id: 'window', label: 'window', icon: PanelsTopLeft, wallpaper: 'sonoma-dark.webp' },
] as const;
</script>

<template>
  <div class="capture-cards" role="group" :aria-label="t('chooseCaptureSource')">
    <Button
      v-for="target in targets"
      :key="target.id"
      variant="card"
      block
      class="capture-card"
      :class="{ 'is-selected': selected === target.id }"
      :disabled="disabled"
      :aria-label="t(target.label)"
      :title="t(target.label)"
      @click="emit('choose', target.id)"
    >
      <span class="capture-artwork" :class="target.id" aria-hidden="true">
        <img :src="resolvePublicAssetUrl(`/wallpapers/image/${target.wallpaper}`)" alt="" draggable="false" />
        <span v-if="target.id === 'region'" class="region-outline" />
        <span v-if="target.id === 'window'" class="window-outline"><span class="window-dots">•••</span></span>
      </span>
      <span class="capture-label"><component :is="target.icon" :size="12" />{{ t(target.label) }}</span>
    </Button>
  </div>
</template>

<style scoped>
.capture-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
/* Button's native control is inside its shared wrapper. */
.capture-cards :deep(.capture-card) {
  height: 110px;
  padding: 6px 6px 0;
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
}
.capture-cards :deep(.capture-card.is-selected) {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.capture-artwork {
  position: relative;
  display: block;
  height: 74px;
  overflow: hidden;
  border-radius: var(--radius-xs);
}
.capture-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.region-outline,
.window-outline {
  position: absolute;
  left: 22%;
  top: 20%;
  width: 58%;
  height: 60%;
  border: 2px solid var(--text-light);
  border-radius: var(--radius-sm);
}
.region-outline {
  box-shadow: 0 0 0 80px var(--color-overlay-artwork);
}
.window-outline {
  height: 66%;
  top: 17%;
  background: var(--color-overlay-artwork);
  border-width: 1px;
}
.window-dots {
  display: block;
  height: 12px;
  border-bottom: 1px solid var(--text-light);
  font: var(--weight-display) 14px / 7px var(--font-sans);
  text-align: left;
  padding-left: 4px;
  color: var(--text-light);
}
.capture-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--weight-body);
}
.is-selected .capture-label svg {
  color: var(--color-primary);
}
</style>
