<script setup lang="ts">
import { computed, ref } from 'vue';
import { Code2, Pause, Play } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { detectPlatform } from '@website/lib/platform-downloads';

const { t } = useI18n();
const platform = computed(() => (typeof navigator === 'undefined' ? 'windows' : detectPlatform(navigator)));
const video = ref<HTMLVideoElement | null>(null);
const isVideoPaused = ref(false);

const HERO_VIDEO_URL = '/website-demo.webm';
const HERO_PUNCTUATION = /([.!?。！？।]+)/u;
const ONLY_HERO_PUNCTUATION = /^[.!?。！？।]+$/u;
const heroTitleParts = computed(() =>
  t('Website.home.heroLine1')
    .split(HERO_PUNCTUATION)
    .filter(Boolean)
    .map((text) => ({ text, punctuation: ONLY_HERO_PUNCTUATION.test(text) })),
);

const toggleVideo = async () => {
  if (!video.value) return;
  if (isVideoPaused.value) {
    try {
      await video.value.play();
    } catch {
      isVideoPaused.value = true;
    }
    return;
  }
  video.value.pause();
};
</script>

<template>
  <section class="website-hero" aria-labelledby="hero-title">
    <div class="website-hero__copy">
      <h1 id="hero-title">
        <span
          v-for="(part, index) in heroTitleParts"
          :key="`${part.text}-${index}`"
          :class="{ 'hero-title__punctuation': part.punctuation }"
          >{{ part.text }}</span
        >
      </h1>
      <p class="lede">{{ t('Website.home.lede') }}</p>
      <div class="hero-availability">
        <strong>{{ t('Website.home.availabilityTitle') }}</strong>
        <span>{{ t('Website.home.availabilityPlatforms') }}</span>
      </div>
      <div class="hero-actions">
        <Button :href="platform ? `/install?os=${platform}` : '/install'" size="lg">
          <template v-if="platform" #icon><WebsitePlatformIcon :platform="platform" /></template>
          {{ t('Website.home.downloadFree') }}
        </Button>
        <a class="secondary-action" href="https://github.com/BeamRecorder/Beam" target="_blank" rel="noreferrer">
          <Code2 aria-hidden="true" /> {{ t('Website.home.viewGitHub') }}
        </a>
      </div>
    </div>

    <div class="website-hero__media">
      <video
        ref="video"
        class="website-hero__video"
        :aria-label="t('Website.home.demoAlt')"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        @pause="isVideoPaused = true"
        @play="isVideoPaused = false"
      >
        <source :src="HERO_VIDEO_URL" type="video/webm" />
      </video>
      <button
        class="website-hero__video-control"
        type="button"
        :aria-label="t(isVideoPaused ? 'Website.home.playDemo' : 'Website.home.pauseDemo')"
        :title="t(isVideoPaused ? 'Website.home.playDemo' : 'Website.home.pauseDemo')"
        @click="toggleVideo"
      >
        <Play v-if="isVideoPaused" aria-hidden="true" />
        <Pause v-else aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.website-hero {
  display: grid;
  grid-template-columns: minmax(440px, 0.68fr) minmax(0, 1.32fr);
  align-items: center;
  gap: 32px;
  width: min(calc(100vw - 120px), 1400px);
  min-height: calc(100dvh - 72px);
  padding: 88px 0 48px;
}

.website-hero__copy {
  max-width: 520px;
}

.website-hero__copy h1 {
  font-size: clamp(62px, 5.2vw, 78px);
}

.hero-title__punctuation {
  display: inline-block;
  margin: 0 0.14em 0 0.08em;
}

.hero-availability {
  display: grid;
  gap: 2px;
  margin-top: 24px;
}

.hero-availability strong {
  font-size: 16px;
}

.hero-availability span {
  color: var(--text-secondary);
  font-size: 14px;
}

.website-hero__media {
  position: relative;
  display: flex;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--color-border-strong);
  border-radius: 22px;
  background: var(--color-media-surface);
  box-shadow: var(--shadow-lg);
}

.website-hero__video-control {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: var(--radius-md);
  background: rgb(17 16 14 / 76%);
  box-shadow: var(--shadow-sm);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.website-hero__video-control:hover {
  background: rgb(17 16 14 / 90%);
}

.website-hero__video-control:focus-visible {
  outline: 2px solid white;
  outline-offset: 2px;
}

.website-hero__video-control svg {
  width: 17px;
  height: 17px;
}

.website-hero__video {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--color-media-surface);
  object-fit: cover;
}

@media (max-width: 1050px) {
  .website-hero {
    grid-template-columns: 1fr;
    gap: 32px;
    width: 100%;
    padding: 64px 0 40px;
  }
}

@media (max-width: 700px) {
  .website-hero {
    padding: 56px 0 32px;
  }
}
</style>
