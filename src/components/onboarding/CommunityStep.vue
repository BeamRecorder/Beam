<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ExternalLink, Rocket, Star } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';

const emit = defineEmits<{
  (e: 'complete'): void;
}>();

const { t } = useTranslate('Onboarding');

const starCount = ref<number | null>(null);

onMounted(async () => {
  try {
    const res = await capture.getGitHubStars();
    if (res && typeof res.stars === 'number') {
      starCount.value = res.stars;
    }
  } catch {
    // Background fetch
  }
});

const handleDiscord = () => {
  void capture.openDiscordInvite();
};

const handleGitHub = () => {
  void capture.openGithubRepository();
};

const handleComplete = () => {
  emit('complete');
};
</script>

<template>
  <div class="community-step">
    <!-- Header -->
    <div class="community-header">
      <h2 class="community-title">{{ t('communityTitle') }}</h2>
      <p class="community-subtitle">{{ t('communitySubtitle') }}</p>
    </div>

    <!-- Main Cards Grid -->
    <div class="community-cards-grid">
      <!-- 1. Real Updates & Engine Controls Card -->
      <div class="card-item update-card">
        <UpdateControls :show-icon="true" :center="true" />
      </div>

      <!-- 2. GitHub Stars Card -->
      <div class="card-item github-card">
        <div class="card-top">
          <div class="card-icon-wrap">
            <Star class="card-icon star-icon" />
          </div>
          <div class="card-titles">
            <span class="card-title">{{ t('starTitle') }}</span>
            <span class="card-desc">{{ t('starDesc') }}</span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="xs"
          :block="true"
          class="center-action-btn"
          @click="handleGitHub"
        >
          <template #icon><Star class="btn-icon star-colored" /></template>
          <span>{{ t('starButton') }}</span>
          <span v-if="starCount !== null" class="star-badge">{{ starCount }}</span>
        </Button>
      </div>

      <!-- 3. Discord Community Card -->
      <div class="card-item discord-card">
        <div class="card-top">
          <div class="card-icon-wrap">
            <svg class="card-icon discord-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.893a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>
          <div class="card-titles">
            <span class="card-title">{{ t('discordTitle') }}</span>
            <span class="card-desc">{{ t('discordDesc') }}</span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="xs"
          :block="true"
          class="center-action-btn"
          @click="handleDiscord"
        >
          <template #icon><ExternalLink class="btn-icon" /></template>
          <span>{{ t('discordButton') }}</span>
        </Button>
      </div>
    </div>

    <!-- Final Launch Beam CTA Section -->
    <div class="launch-cta-wrap">
      <Button
        variant="primary"
        size="md"
        class="launch-button"
        @click="handleComplete"
      >
        <template #icon><Rocket class="launch-icon" /></template>
        <span class="launch-label">{{ t('launchBeam') }}</span>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.community-step {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 16px 24px 20px;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.community-header {
  text-align: center;
}

.community-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.community-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.community-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  width: 100%;
  max-width: 680px;
  align-items: stretch;
}

.card-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-surface) 65%, transparent);
  border: 1px solid var(--color-border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  min-height: 130px;
  box-sizing: border-box;
}

.card-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 5px;
  min-height: 82px;
  justify-content: flex-start;
}

.card-icon-wrap {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-element) 90%, transparent);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-bottom: 2px;
}

.card-icon {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
}

.card-icon.star-icon {
  color: #f59e0b;
}

.card-icon.discord-icon {
  color: #5865f2;
}

.card-titles {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 5px;
}

.card-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 16px;
  color: var(--text-primary);
  margin: 0;
}

.card-desc {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 14px;
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.center-action-btn {
  width: 100%;
  justify-content: center;
  margin-top: 8px;
}

.btn-icon {
  width: 13px;
  height: 13px;
}

.star-colored {
  color: #f59e0b;
}

.star-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
  color: var(--text-primary);
  margin-left: 4px;
}

.launch-cta-wrap {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.launch-button {
  padding: 10px 36px;
  font-size: 13.5px;
  font-weight: 700;
  border-radius: 10px;
  min-width: 200px;
  justify-content: center;
}

.launch-icon {
  width: 16px;
  height: 16px;
}
</style>
