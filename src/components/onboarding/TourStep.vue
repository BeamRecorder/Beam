<script setup lang="ts">
import { computed, ref } from 'vue';
import { Circle, FolderOpen, HelpCircle, Layers, Layout, Mic, Monitor, ScrollText, Video, Volume2 } from '@lucide/vue';
import HUD from '~/components/hud/HUD.vue';
import HudClickEmptyState from './HudClickEmptyState.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const { t } = useTranslate('Onboarding');

export type FeatureKey =
  | 'mic'
  | 'camera'
  | 'teleprompter'
  | 'systemAudio'
  | 'source'
  | 'tabs'
  | 'projects'
  | 'topbar'
  | 'record';

const activeFeature = ref<FeatureKey | null>(null);

interface FeatureMeta {
  key: FeatureKey;
  icon: any;
  label: string;
  badge: string;
  title: string;
  description: string;
}

const featuresData = computed<Record<FeatureKey, FeatureMeta>>(() => ({
  mic: {
    key: 'mic',
    icon: Mic,
    label: t('hudAudioTitle'),
    badge: t('badgeAudio'),
    title: t('hudAudioTitle'),
    description: t('hudAudioDesc'),
  },
  camera: {
    key: 'camera',
    icon: Video,
    label: t('hudCameraTitle'),
    badge: t('badgeCamera'),
    title: t('hudCameraTitle'),
    description: t('hudCameraDesc'),
  },
  teleprompter: {
    key: 'teleprompter',
    icon: ScrollText,
    label: t('hudTeleprompterTitle'),
    badge: t('badgeScript'),
    title: t('hudTeleprompterTitle'),
    description: t('hudTeleprompterDesc'),
  },
  systemAudio: {
    key: 'systemAudio',
    icon: Volume2,
    label: t('hudSystemAudioTitle'),
    badge: t('badgeSystem'),
    title: t('hudSystemAudioTitle'),
    description: t('hudSystemAudioDesc'),
  },
  source: {
    key: 'source',
    icon: Monitor,
    label: t('hudSourceTitle'),
    badge: t('badgeDisplay'),
    title: t('hudSourceTitle'),
    description: t('hudSourceDesc'),
  },
  tabs: {
    key: 'tabs',
    icon: Layout,
    label: t('hudTabsTitle'),
    badge: t('badgeModes'),
    title: t('hudTabsTitle'),
    description: t('hudTabsDesc'),
  },
  projects: {
    key: 'projects',
    icon: FolderOpen,
    label: t('hudProjectsTitle'),
    badge: t('badgeProjects'),
    title: t('hudProjectsTitle'),
    description: t('hudProjectsDesc'),
  },
  topbar: {
    key: 'topbar',
    icon: Layers,
    label: t('hudTopbarTitle'),
    badge: t('badgeSettings'),
    title: t('hudTopbarTitle'),
    description: t('hudTopbarDesc'),
  },
  record: {
    key: 'record',
    icon: Circle,
    label: t('hudRecordTitle'),
    badge: t('badgeAction'),
    title: t('hudRecordTitle'),
    description: t('hudRecordDesc'),
  },
}));

const featureKeys: FeatureKey[] = [
  'mic',
  'camera',
  'teleprompter',
  'systemAudio',
  'source',
  'tabs',
  'projects',
  'topbar',
  'record',
];

const handleFeatureFocus = (key: string) => {
  if (key in featuresData.value) {
    activeFeature.value = key as FeatureKey;
  }
};

const toggleChip = (key: FeatureKey) => {
  if (activeFeature.value === key) {
    activeFeature.value = null;
  } else {
    activeFeature.value = key;
  }
};
</script>

<template>
  <div class="tour-step">
    <!-- Header -->
    <div class="tour-header">
      <h2 class="tour-title">{{ t('quickTour') }}</h2>
      <p class="tour-subtitle">{{ t('tourSubtitle') }}</p>
    </div>

    <!-- Main Showcase Layout -->
    <div class="tour-layout">
      <!-- Real Interactive HUD Stage -->
      <div class="hud-stage" @click.self="activeFeature = null">
        <div class="wallpaper-layer" @click="activeFeature = null">
          <img :src="resolvePublicAssetUrl('/brand/amber-l.jpg')" alt="" class="wallpaper-img" aria-hidden="true" />
          <div class="wallpaper-vignette"></div>
        </div>

        <div class="real-hud-frame">
          <HUD :embedded="true" :show-topbar="true" @focus-feature="handleFeatureFocus" />
        </div>
      </div>

      <!-- Feature Detail Side Inspector -->
      <aside class="tour-inspector-panel">
        <!-- Feature Mini Chips Ribbon -->
        <div class="chips-ribbon">
          <button
            type="button"
            class="chip-btn chip-guide"
            :class="{ active: activeFeature === null }"
            @click="activeFeature = null"
          >
            <HelpCircle class="chip-icon" />
            <span class="chip-label">Guide</span>
          </button>

          <button
            v-for="key in featureKeys"
            :key="key"
            type="button"
            class="chip-btn"
            :class="{ active: activeFeature === key }"
            @click="toggleChip(key)"
          >
            <component :is="featuresData[key].icon" class="chip-icon" />
            <span class="chip-label">{{ featuresData[key].label }}</span>
          </button>
        </div>

        <!-- Animated Empty State vs Active Feature Inspector Card -->
        <Transition name="inspector-fade" mode="out-in">
          <div v-if="activeFeature === null" key="empty" class="inspector-content-box">
            <HudClickEmptyState />
          </div>

          <div v-else :key="activeFeature" class="feature-detail-card">
            <div class="card-top-row">
              <div class="feature-icon-box">
                <component :is="featuresData[activeFeature].icon" class="feature-large-icon" />
              </div>
              <div class="feature-title-group">
                <span class="feature-badge">{{ featuresData[activeFeature].badge }}</span>
                <h3 class="feature-heading">{{ featuresData[activeFeature].title }}</h3>
              </div>
            </div>

            <p class="feature-main-desc">
              {{ featuresData[activeFeature].description }}
            </p>
          </div>
        </Transition>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tour-step {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 8px 24px 10px;
  box-sizing: border-box;
  gap: 8px;
  overflow: hidden;
}

.tour-header {
  text-align: center;
}

.tour-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.tour-subtitle {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.tour-layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 14px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

.hud-stage {
  position: relative;
  height: 100%;
  min-height: 0;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
}

.wallpaper-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.wallpaper-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.96) saturate(1.05);
  transform: scale(1.02);
}

.wallpaper-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.45) 100%);
}

.real-hud-frame {
  position: relative;
  z-index: 1;
  max-height: 98%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0.92);
  transform-origin: center;
  cursor: default;
}

.tour-inspector-panel {
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--color-bg-surface) 85%, transparent);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 12px;
  box-sizing: border-box;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.chips-ribbon {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.chip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  background: color-mix(in srgb, var(--color-bg-surface) 80%, transparent);
  border: 1px solid var(--color-border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
  border-color: var(--color-border-strong);
}

.chip-btn.active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.chip-guide.active {
  background: color-mix(in srgb, var(--color-bg-surface-hover) 90%, transparent);
  border-color: var(--color-border-strong);
  color: var(--text-primary);
}

.chip-icon {
  width: 12px;
  height: 12px;
}

.inspector-content-box {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.feature-detail-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 14px;
  box-sizing: border-box;
  overflow-y: auto;
}

.card-top-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feature-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-primary);
}

.feature-large-icon {
  width: 20px;
  height: 20px;
}

.feature-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-badge {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-primary);
}

.feature-heading {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.feature-main-desc {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.feature-bullets-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bullet-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-primary);
}

.bullet-check-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--color-primary);
  margin-top: 1px;
}

.interactive-try-banner {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border: 1px dashed color-mix(in srgb, var(--color-primary) 40%, transparent);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-primary);
}

.try-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

/* Transitions */
.inspector-fade-enter-active,
.inspector-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.inspector-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.inspector-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
