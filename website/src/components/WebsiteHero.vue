<script setup lang="ts">
import { computed, ref } from 'vue';
import { Code2, Pause, Play } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from '~/ui/button/Button.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { detectPlatform } from '@website/lib/platform-downloads';

const { t } = useI18n();
const router = useRouter();
const platform = computed(() => (typeof navigator === 'undefined' ? 'windows' : detectPlatform(navigator)));
const video = ref<HTMLVideoElement | null>(null);
const isVideoPaused = ref(false);

const HERO_VIDEO_URL = '/website-demo.webm';
const HERO_PHRASE = /[^.!?。！？।]+[.!?。！？।]*/gu;
const heroTitlePhrases = computed(
  () =>
    t('Website.home.heroLine1')
      .match(HERO_PHRASE)
      ?.map((part) => part.trim()) ?? [],
);

const toggleVideo = async () => {
  if (!video.value) return;
  if (video.value.paused) {
    try {
      await video.value.play();
    } catch {
      isVideoPaused.value = true;
    }
    return;
  }
  video.value.pause();
};

const beginInstall = () => {
  void router.push({ path: '/install', query: platform.value ? { os: platform.value } : {} });
};
</script>

<template>
  <section class="website-hero" aria-labelledby="hero-title">
    <div class="website-hero__copy">
      <h1 id="hero-title">
        <template v-for="(phrase, index) in heroTitlePhrases" :key="phrase">
          <span class="hero-title__phrase">{{ phrase }}</span
          >{{ index < heroTitlePhrases.length - 1 ? ' ' : '' }}
        </template>
      </h1>
      <p class="lede">{{ t('Website.home.lede') }}</p>
      <div class="hero-availability">
        <strong>{{ t('Website.home.availabilityTitle') }}</strong>
        <span>{{ t('Website.home.availabilityPlatforms') }}</span>
      </div>
      <div class="hero-actions">
        <Button :href="platform ? `/install?os=${platform}` : '/install'" size="lg" @click.prevent="beginInstall">
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
  grid-template-columns: minmax(360px, 0.58fr) minmax(0, 1.42fr);
  align-items: center;
  gap: clamp(40px, 4vw, 64px);
  width: 100%;
  min-width: 0;
  min-height: clamp(680px, calc(100dvh - 72px), 820px);
  padding: 72px 0 44px;
}

.website-hero__copy {
  max-width: 520px;
}

.website-hero__copy h1 {
  font-size: clamp(56px, 4.8vw, 72px);
}

.hero-title__phrase {
  display: inline-block;
  margin-right: 0.08em;
  white-space: nowrap;
}

.hero-title__phrase:last-child {
  margin-right: 0;
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
  min-width: 0;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--color-border-strong);
  border-radius: 22px;
  background: var(--color-media-surface);
  box-shadow: 0 18px 36px -18px rgb(42 36 28 / 55%);
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
  max-width: 100%;
  height: 100%;
  background: var(--color-media-surface);
  object-fit: cover;
}

:global(html.dark) .website-hero__media {
  box-shadow: 0 18px 38px -16px rgb(0 0 0 / 78%);
}

@media (max-width: 1050px) {
  .website-hero {
    grid-template-columns: 1fr;
    gap: 32px;
    width: 100%;
    min-height: 0;
    padding: 64px 0 40px;
  }
}

@media (max-width: 700px) {
  .website-hero {
    padding: 56px 0 32px;
  }
}
</style>
