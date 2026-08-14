<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { capture } from '~/api/capture';

const { t } = useTranslate('HudPreferences');
const currentVersion = ref('0.1.2');

onMounted(async () => {
  try {
    const state = await capture.getUpdateState();
    if (state && state.currentVersion) {
      currentVersion.value = state.currentVersion;
    }
  } catch (error) {
    console.error('Failed to resolve current app version:', error);
  }
});
</script>

<template>
  <div class="about-container">
    <div class="about-content">
      <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" class="about-logo" alt="Beam logo" />
      <h2 class="about-name">Beam</h2>
      <p class="about-version">{{ t('version', { version: currentVersion }) }}</p>

      <p class="about-description">
        {{ t('aboutDescriptionText') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex: 1;
  height: 100%;
  padding: 24px 16px;
  box-sizing: border-box;
  width: 100%;
  overflow-y: auto;
}

.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  max-width: 280px;
}

.about-logo {
  width: 96px;
  height: 96px;
  object-fit: contain;
  border-radius: 22px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.08),
    0 2px 6px rgba(0, 0, 0, 0.04);
}

.about-name {
  font-size: 24px;
  font-weight: 750;
  color: var(--text-primary);
  margin: 0;
  margin-top: 4px;
  letter-spacing: -0.5px;
}

.about-version {
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--text-muted);
  margin: 0;
  opacity: 0.8;
}

.about-description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0;
  margin-top: 12px;
  font-weight: 450;
}
</style>
