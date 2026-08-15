<script setup lang="ts">
import { Globe, ArrowRight, Monitor, Zap, Captions, Sparkles } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useLocaleStore } from '~/stores/locale';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';
import Select from '~/ui/select/Select.vue';
import Button from '~/ui/button/Button.vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const emit = defineEmits<{
  (e: 'next'): void;
}>();

const { t } = useTranslate('Onboarding');
const localeStore = useLocaleStore();

const handleLocaleChange = (newLocale: string) => {
  if (isSupportedLocale(newLocale)) localeStore.setLocale(newLocale);
};

const handleNext = () => {
  emit('next');
};

const highlights = [
  {
    icon: Monitor,
    titleKey: 'featureNativeTitle',
    descKey: 'featureNativeDesc',
  },
  {
    icon: Zap,
    titleKey: 'featureAutoZoomTitle',
    descKey: 'featureAutoZoomDesc',
  },
  {
    icon: Captions,
    titleKey: 'featureCaptionsTitle',
    descKey: 'featureCaptionsDesc',
  },
  {
    icon: Sparkles,
    titleKey: 'featureQualityTitle',
    descKey: 'featureQualityDesc',
  },
];
</script>

<template>
  <div class="welcome-step">
    <!-- Header with Language Selector -->
    <header class="welcome-topbar">
      <div class="lang-selector-group">
        <Globe class="lang-icon" />
        <Select
          :model-value="localeStore.locale"
          :options="localeOptions"
          size="sm"
          class="lang-select"
          @update:model-value="handleLocaleChange"
        />
      </div>
    </header>

    <!-- Main Hero -->
    <div class="welcome-hero">
      <!-- Prominent Beam Logo (large, no excess whitespace) -->
      <div class="logo-box">
        <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" alt="Beam Logo" class="beam-logo-img" />
      </div>

      <div class="hero-content">
        <h1 class="welcome-title">{{ t('welcomeTitle') }}</h1>
        <p class="welcome-tagline">{{ t('welcomeSubtitle') }}</p>
      </div>

      <!-- Feature Grid -->
      <div class="features-grid">
        <div v-for="item in highlights" :key="item.titleKey" class="feature-card">
          <div class="feature-icon-container">
            <component :is="item.icon" class="feature-icon" />
          </div>
          <div class="feature-text">
            <h3 class="feature-card-title">{{ t(item.titleKey) }}</h3>
            <p class="feature-card-desc">{{ t(item.descKey) }}</p>
          </div>
        </div>
      </div>

      <!-- Call to Action (Breathing room for buttons & icons) -->
      <div class="cta-section">
        <Button size="lg" class="cta-button" @click="handleNext">
          <div class="cta-btn-inner">
            <span class="cta-label">{{ t('getStarted') }}</span>
            <ArrowRight class="btn-arrow-icon" />
          </div>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome-step {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 12px 32px 20px;
  box-sizing: border-box;
}

.welcome-topbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 8px;
}

.lang-selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lang-icon {
  width: 15px;
  height: 15px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.lang-select {
  min-width: 120px;
}

.welcome-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  max-width: 760px;
  margin: 0 auto;
  gap: 16px;
}

.logo-box {
  width: 76px;
  height: 76px;
  border-radius: 18px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  padding: 4px;
  box-sizing: border-box;
}

.beam-logo-img {
  width: 68px;
  height: 68px;
  object-fit: contain;
}

.hero-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.welcome-title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--text-primary);
}

.welcome-tagline {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 580px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  margin-top: 4px;
}

.feature-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-surface) 85%, transparent);
  border: 1px solid var(--color-border);
  backdrop-filter: blur(10px);
  text-align: left;
  transition: border-color 0.15s ease;
}

.feature-card:hover {
  border-color: var(--color-border-strong);
}

.feature-icon-container {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.feature-icon {
  width: 16px;
  height: 16px;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.feature-card-desc {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-secondary);
  line-height: 1.35;
}

.cta-section {
  margin-top: 6px;
}

.cta-button {
  padding: 12px 34px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 12px;
}

.cta-btn-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  line-height: 1;
}

.cta-label {
  display: inline-flex;
  align-items: center;
  line-height: 1;
  letter-spacing: 0.01em;
}

.btn-arrow-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-block;
  vertical-align: middle;
}
</style>
