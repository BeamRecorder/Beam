<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Check, Copy } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import BrandLogo from '~/components/brand/BrandLogo.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';
import SocialLinks from '~/components/socials/SocialLinks.vue';
import { useCopySystemInformation } from '~/composables/useCopySystemInformation';

const { t } = useTranslate('HudPreferences');
const { t: tSettings } = useTranslate('SettingsPanel');
const { copied, copy } = useCopySystemInformation();
const currentVersion = ref<string | null>(null);
const versionFailed = ref(false);

onMounted(async () => {
  try {
    const state = await capture.getUpdateState();
    currentVersion.value = state?.currentVersion || null;
    versionFailed.value = !currentVersion.value;
  } catch {
    versionFailed.value = true;
  }
});
</script>

<template>
  <div class="about-container">
    <div class="about-content" data-setting="about" tabindex="-1">
      <BrandLogo layout="stacked" class="about-brand" />
      <p class="about-version">
        {{ versionFailed ? t('versionUnavailable') : t('version', { version: currentVersion ?? '…' }) }}
      </p>
      <p class="about-description-title">{{ t('aboutDescriptionTitle') }}</p>
      <p class="about-description">{{ t('aboutDescriptionText') }}</p>
    </div>
    <div class="about-card"><UpdateControls /></div>
    <div class="about-card" data-setting="socials" tabindex="-1">
      <SocialLinks />
    </div>
    <div class="about-support" data-setting="system-info" tabindex="-1">
      <Button variant="secondary" size="sm" class="system-info-button" @click="copy">
        <template #icon><Check v-if="copied" /><Copy v-else /></template>
        {{ copied ? tSettings('copied') : tSettings('copySysInfo') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  max-width: 560px;
  margin: 0 auto;
}
.about-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 12px 12px 24px;
}
.about-brand {
  color: var(--text-primary);
}
.about-version {
  font-size: var(--font-size-lg);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  margin: 0;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: var(--color-bg-field);
}
.about-description,
.about-description-title {
  margin: 0;
  font-size: var(--font-size-lg);
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 400px;
}
.about-description-title {
  margin-top: 8px;
  font-weight: var(--weight-display);
  color: var(--text-primary);
}
.about-card {
  background: var(--color-bg-element);
  border-radius: var(--radius-lg);
  padding: 20px;
}
.about-support {
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}
[data-setting]:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 4px;
  border-radius: var(--radius-lg);
}
</style>
