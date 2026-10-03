<script setup lang="ts">
import { ref } from 'vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
const { t } = useTranslate('Onboarding');
const { t: canvas } = useTranslate('CanvasPanel');
const background = ref<'gradient' | 'photo' | 'color'>('gradient');
const photo = resolvePublicAssetUrl('/onboarding/alpine-dawn.webp');
</script>
<template>
  <div class="screenshot-tour">
    <div
      class="capture-example"
      :class="background"
      :style="background === 'photo' ? { backgroundImage: `url(${photo})` } : undefined"
    >
      <img :src="resolvePublicAssetUrl('/onboarding/recorder.webp')" :alt="t('recorderTitle')" />
    </div>
    <div class="background-choices" role="group" :aria-label="canvas('backgroundType')">
      <Button
        v-for="choice in ['gradient', 'photo', 'color'] as const"
        :key="choice"
        size="sm"
        :variant="background === choice ? 'selected' : 'ghost'"
        :aria-pressed="background === choice"
        @click="background = choice"
        >{{ choice === 'gradient' ? t('gradientFeature') : canvas(choice === 'photo' ? 'image' : 'color') }}</Button
      >
    </div>
    <p>{{ t('imageTour') }}</p>
  </div>
</template>
<style scoped>
.screenshot-tour {
  display: grid;
  gap: 18px;
}
.capture-example {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 300px;
  aspect-ratio: 2.2;
  padding: 38px;
  box-sizing: border-box;
  border-radius: var(--radius-lg);
  background-size: cover;
  background-position: center;
}
.capture-example.gradient {
  background: linear-gradient(135deg, #e3a29b, #b499df 50%, #78a4cf);
}
.capture-example.color {
  background: var(--color-bg-surface-hover);
}
.capture-example img {
  width: 380px;
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
  filter: drop-shadow(0 16px 24px rgb(15 16 28 / 25%));
}
.background-choices {
  display: flex;
  justify-content: center;
  gap: 8px;
}
p {
  min-height: 48px;
  margin: 0 auto;
  max-width: 600px;
  text-align: center;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
