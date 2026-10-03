<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { VideoTourFeature } from './onboarding-types';
const { t } = useTranslate('Onboarding');
const feature = ref<VideoTourFeature>('editing');
const choices = ['editing', 'zooms', 'backgrounds', 'export'] as const;
const images = {
  editing: 'video-editor',
  zooms: 'video-zooms',
  backgrounds: 'video-backgrounds',
  export: 'video-export',
};
const current = computed(() => resolvePublicAssetUrl(`/onboarding/${images[feature.value]}.webp`));
</script>
<template>
  <div class="video-tour">
    <div class="editor-image"><img :src="current" :alt="t(`${feature}Feature`)" /></div>
    <div class="feature-tabs" role="group" :aria-label="t('videoTitle')">
      <Button
        v-for="choice in choices"
        :key="choice"
        size="sm"
        :variant="feature === choice ? 'selected' : 'ghost'"
        :aria-pressed="feature === choice"
        @click="feature = choice"
        >{{ t(`${choice}Feature`) }}</Button
      >
    </div>
    <p aria-live="polite">{{ t(`${feature}Tour`) }}</p>
  </div>
</template>
<style scoped>
.video-tour {
  display: grid;
  gap: 18px;
}
.editor-image {
  height: 300px;
  display: grid;
  place-items: center;
}
.editor-image img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
}
.feature-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
p {
  max-width: 600px;
  min-height: 48px;
  margin: 0 auto;
  text-align: center;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
</style>
