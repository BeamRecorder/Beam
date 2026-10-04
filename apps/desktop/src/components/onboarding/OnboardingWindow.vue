<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Minus, RefreshCw, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { capture } from '~/api/capture';
import { useThemeStore } from '~/stores/theme';
import { useTranslate } from '~/i18n/useTranslate';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import OnboardingRecorder from './OnboardingRecorder.vue';
import OnboardingQuickSnip from './OnboardingQuickSnip.vue';
import OnboardingVideo from './OnboardingVideo.vue';
import OnboardingScreenshot from './OnboardingScreenshot.vue';
import { ONBOARDING_STEPS } from './onboarding-types';
import OnboardingPreferences from './OnboardingPreferences.vue';
import { useOnboarding } from './useOnboarding';

const theme = useThemeStore();
const { t } = useTranslate('Onboarding');
const { step, mode, loading, loadFailed, busy, error, load, navigate, finish } = useOnboarding();
const heading = ref<HTMLHeadingElement | null>(null);
const welcome = computed(() => step.value === 0);
const photograph = computed(() =>
  resolvePublicAssetUrl(`/onboarding/alpine-${theme.isDarkMode ? 'night' : 'dawn'}.webp`),
);
const titles = computed(() => ONBOARDING_STEPS.map((key) => t(key)));
const lastStep = ONBOARDING_STEPS.length - 1;
const nextLabel = computed(() =>
  step.value === lastStep ? t('start') : step.value === 0 ? t('discover') : t('continue'),
);
const advance = () => (step.value === lastStep ? void finish() : navigate(1));
watch(step, async () => {
  await nextTick();
  heading.value?.focus();
});
</script>

<template>
  <div
    class="onboarding"
    :class="{ dark: theme.isDarkMode, welcome, mac: capture.platform === 'darwin' }"
    :aria-busy="busy || loading"
  >
    <aside v-if="welcome" class="landscape" aria-hidden="true">
      <img class="landscape-image" :src="photograph" alt="" fetchpriority="high" />
      <div class="landscape-shade" />
      <span class="photo-credit">Unsplash</span>
    </aside>
    <header class="titlebar">
      <div class="brand" :class="{ 'on-photo': welcome }">
        <img :src="resolvePublicAssetUrl('/brand/BeamIcon.webp')" alt="" width="30" height="30" /><span>Beam</span>
      </div>
      <div v-if="capture.platform !== 'darwin'" class="window-controls">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="Minus"
          :aria-label="t('minimize')"
          @click="capture.minimize()"
        />
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="X"
          :disabled="busy"
          :aria-label="t('close')"
          @click="finish(true)"
        />
      </div>
    </header>
    <main class="content">
      <ScrollShadow class="content-scroll" :hide-scrollbar="welcome" stable-scrollbar>
        <section class="page" :key="step">
          <template v-if="welcome">
            <h1 ref="heading" class="hero-title" tabindex="-1">
              <span>{{ t('headlineFirst') }}</span
              ><span>{{ t('headlineSecond') }}</span>
            </h1>
            <p class="hero-description">{{ t('heroDescription') }}</p>
          </template>
          <template v-else>
            <h1 ref="heading" class="page-title" tabindex="-1">{{ titles[step] }}</h1>
            <OnboardingRecorder v-if="step === 1" v-model="mode" />
            <OnboardingQuickSnip v-else-if="step === 2" />
            <OnboardingVideo v-else-if="step === 3" />
            <OnboardingScreenshot v-else-if="step === 4" />
            <OnboardingPreferences v-else :disabled="busy" />
          </template>
        </section>
      </ScrollShadow>
      <div v-if="error" class="error" role="alert">
        <span>{{ t('saveError') }} {{ error }}</span>
        <Button v-if="loadFailed" variant="secondary" size="sm" :icon="RefreshCw" :loading="loading" @click="load">{{
          t('retry')
        }}</Button>
      </div>
      <footer class="footer" :class="{ 'welcome-footer': welcome }">
        <div v-if="!welcome" class="back-action">
          <Button variant="ghost" :icon="ArrowLeft" :disabled="busy" @click="navigate(-1)">{{ t('back') }}</Button>
        </div>
        <div class="next-action">
          <Button class="continue" size="lg" :loading="busy || loading" :disabled="loadFailed" @click="advance"
            ><span class="continue-label">{{ nextLabel }}<ArrowRight :size="18" aria-hidden="true" /></span
          ></Button>
        </div>
      </footer>
      <nav v-if="!welcome" class="progress" :aria-label="t('progress')">
        <Button
          v-for="(title, index) in titles"
          :key="index"
          variant="ghost"
          size="xs"
          icon-only
          :aria-label="title"
          :tooltip="title"
          :tooltip-delay="200"
          :aria-current="step === index ? 'step' : undefined"
          :disabled="busy || loading || loadFailed"
          @click="navigate(index - step)"
        >
          <template #icon
            ><span class="progress-dot" :class="{ active: step === index, done: step > index }"
          /></template>
        </Button>
      </nav>
    </main>
  </div>
</template>

<style scoped src="./onboarding-window.css"></style>
