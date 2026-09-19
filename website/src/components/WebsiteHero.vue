<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, Clapperboard, Code2, Pause, Play, ScanLine, Sparkles, Zap } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from '~/ui/button/Button.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { HOME_PAGE_COPY } from '@website/content/home-page';
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
const modes = computed(() => [
  { id: 'instant', label: HOME_PAGE_COPY.modes.instant, icon: Zap },
  { id: 'studio', label: HOME_PAGE_COPY.modes.studio, icon: Clapperboard },
  { id: 'screenshot', label: HOME_PAGE_COPY.modes.screenshot, icon: ScanLine },
]);

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
    <div class="website-hero__clouds" aria-hidden="true"><i /><i /><i /><i /></div>
    <div class="website-hero__copy">
      <a class="hero-announcement" href="/docs/modes/screenshot">
        <span>{{ HOME_PAGE_COPY.announcement.label }}</span>
        <strong>{{ HOME_PAGE_COPY.announcement.title }}</strong>
        {{ HOME_PAGE_COPY.announcement.action }} <span aria-hidden="true">→</span>
      </a>

      <nav class="hero-modes" :aria-label="HOME_PAGE_COPY.modeNavigation">
        <a v-for="mode in modes" :key="mode.id" :href="`#${mode.id}`" :class="{ 'is-featured': mode.id === 'studio' }">
          <component :is="mode.icon" aria-hidden="true" />{{ mode.label }}
        </a>
      </nav>

      <h1 id="hero-title">
        <template v-for="(phrase, index) in heroTitlePhrases" :key="phrase">
          <span class="hero-title__phrase" :class="{ 'is-accent': index === heroTitlePhrases.length - 1 }">{{
            phrase
          }}</span
          >{{ index < heroTitlePhrases.length - 1 ? ' ' : '' }}
        </template>
      </h1>
      <p class="lede">{{ t('Website.home.lede') }}</p>
      <div class="hero-actions">
        <Button :href="platform ? `/install?os=${platform}` : '/install'" size="lg" @click.prevent="beginInstall">
          <template v-if="platform" #icon><WebsitePlatformIcon :platform="platform" /></template>
          {{ t('Website.home.downloadFree') }}
        </Button>
        <a class="secondary-action" href="#modes">
          {{ HOME_PAGE_COPY.seeHowItWorks }} <ArrowDown aria-hidden="true" />
        </a>
      </div>
      <div class="hero-availability">
        <strong>{{ t('Website.home.availabilityTitle') }}</strong>
        <span>{{ t('Website.home.availabilityPlatforms') }}</span>
        <a href="https://github.com/BeamRecorder/Beam" target="_blank" rel="noreferrer">
          <Code2 aria-hidden="true" />{{ t('Website.home.viewGitHub') }}
        </a>
      </div>
    </div>

    <div class="website-hero__media">
      <span class="hero-demo-label"><Sparkles aria-hidden="true" />{{ HOME_PAGE_COPY.realProductDemo }}</span>
      <div class="macbook-frame">
        <div class="macbook-frame__screen">
          <span class="macbook-frame__camera" aria-hidden="true" />
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
        <span class="macbook-frame__base" aria-hidden="true"><i /></span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.website-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 940px;
  margin-top: 16px;
  padding: clamp(54px, 7vw, 92px) clamp(20px, 5vw, 72px) 0;
  border: 1px solid rgb(74 117 160 / 12%);
  border-radius: 34px;
  background:
    radial-gradient(circle at 78% 7%, rgb(255 229 210 / 58%), transparent 31%),
    linear-gradient(150deg, #d8ecff 0%, #edf6ff 46%, #f7f4f0 100%);
  box-shadow: inset 0 1px rgb(255 255 255 / 82%);
  text-align: center;
}

.website-hero__copy {
  position: relative;
  z-index: 2;
  display: grid;
  max-width: 1040px;
  margin: 0 auto;
  justify-items: center;
}

.hero-announcement {
  display: inline-flex;
  min-height: 38px;
  padding: 0 14px 0 7px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: #181817;
  box-shadow: 0 10px 24px -12px rgb(22 31 42 / 60%);
  color: rgb(255 255 255 / 65%);
  font-size: 12px;
  text-decoration: none;
}

.hero-announcement span:first-child {
  padding: 5px 8px;
  border-radius: 999px;
  background: #9fd1ff;
  color: #13202e;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.hero-announcement strong {
  color: white;
  font-weight: 680;
}

.hero-modes {
  display: inline-flex;
  margin-top: 38px;
  padding: 5px;
  align-items: center;
  border: 1px solid rgb(44 61 77 / 8%);
  border-radius: 999px;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 10px 30px -24px rgb(43 70 96 / 68%);
  backdrop-filter: blur(16px);
}

.hero-modes a {
  display: inline-flex;
  min-height: 36px;
  padding: 0 14px;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  color: #716e69;
  font-size: 13px;
  font-weight: 620;
  text-decoration: none;
  transition:
    color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}

.hero-modes a:hover {
  color: #201e1a;
  transform: translateY(-1px);
}

.hero-modes a.is-featured {
  background: #eee5ff;
  box-shadow: 0 2px 7px rgb(75 52 116 / 9%);
  color: #302244;
}

.hero-modes svg {
  width: 15px;
  height: 15px;
}

.website-hero h1 {
  max-width: 1000px;
  margin-top: clamp(38px, 5vw, 66px);
  color: #171716;
  font-size: clamp(56px, 8.3vw, 116px);
  font-weight: 620;
  letter-spacing: -0.06em;
  line-height: 0.9;
}

.hero-title__phrase {
  display: inline-block;
  white-space: nowrap;
}

.hero-title__phrase.is-accent {
  background: linear-gradient(110deg, #2e9b71 10%, #5e75d8 88%);
  background-clip: text;
  color: transparent;
}

.website-hero .lede {
  max-width: 690px;
  margin-top: 30px;
  color: #5b6064;
}

.hero-actions {
  justify-content: center;
}

.hero-availability {
  display: flex;
  margin-top: 22px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #6d7175;
  font-size: 12px;
}

.hero-availability strong {
  color: #303336;
}

.hero-availability a {
  display: inline-flex;
  margin-left: 5px;
  align-items: center;
  gap: 5px;
  color: #303336;
  font-weight: 700;
  text-decoration: none;
}

.hero-availability a svg {
  width: 14px;
}

.website-hero__clouds {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  opacity: 0.64;
  pointer-events: none;
}

.website-hero__clouds i {
  position: absolute;
  width: 240px;
  height: 84px;
  border-radius: 999px;
  background: rgb(255 255 255 / 76%);
  filter: blur(9px);
  box-shadow:
    62px -21px 0 2px rgb(255 255 255 / 68%),
    138px 4px 0 -14px rgb(255 255 255 / 82%),
    -58px 13px 0 -18px rgb(255 255 255 / 72%);
}

.website-hero__clouds i:nth-child(1) {
  top: 110px;
  left: -100px;
  transform: scale(0.8);
}
.website-hero__clouds i:nth-child(2) {
  top: 250px;
  right: -90px;
  transform: scale(1.1);
}
.website-hero__clouds i:nth-child(3) {
  top: 490px;
  left: 4%;
  transform: scale(0.7);
}
.website-hero__clouds i:nth-child(4) {
  top: 410px;
  right: 18%;
  transform: scale(0.55);
}

.website-hero__media {
  position: relative;
  z-index: 2;
  width: min(100%, 1040px);
  margin: 64px auto -3px;
}

.hero-demo-label {
  display: inline-flex;
  margin-bottom: 14px;
  align-items: center;
  gap: 7px;
  color: #5c6268;
  font-size: 12px;
  font-weight: 700;
}

.hero-demo-label svg {
  width: 15px;
  color: #7b5bd6;
}

.macbook-frame {
  position: relative;
  padding: 16px 17px 0;
  border-radius: 24px 24px 7px 7px;
  background: linear-gradient(140deg, #c9cdd0, #f2f3f4 45%, #aeb3b6 100%);
  box-shadow:
    0 45px 70px -38px rgb(39 59 77 / 58%),
    inset 0 1px rgb(255 255 255 / 92%);
}

.macbook-frame__screen {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 8px solid #171819;
  border-bottom-width: 12px;
  border-radius: 13px 13px 5px 5px;
  background: #111;
}

.macbook-frame__camera {
  position: absolute;
  z-index: 3;
  top: 3px;
  left: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #34383b;
  transform: translateX(-50%);
}

.macbook-frame__base {
  position: absolute;
  right: -5%;
  bottom: -13px;
  left: -5%;
  height: 16px;
  border-radius: 2px 2px 50% 50%;
  background: linear-gradient(180deg, #dadddf, #9ea3a6 72%, #c8ccce);
  box-shadow: 0 10px 12px -10px rgb(42 52 60 / 70%);
}

.macbook-frame__base i {
  display: block;
  width: 14%;
  height: 5px;
  margin: 0 auto;
  border-radius: 0 0 7px 7px;
  background: #9da2a5;
}

.website-hero__video {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--color-media-surface);
  object-fit: cover;
}

.website-hero__video-control {
  position: absolute;
  z-index: 4;
  right: 12px;
  bottom: 12px;
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 11px;
  background: rgb(17 16 14 / 76%);
  box-shadow: var(--shadow-sm);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(10px);
}

.website-hero__video-control:hover {
  background: rgb(17 16 14 / 92%);
}

.website-hero__video-control svg {
  width: 17px;
  height: 17px;
}

@media (max-width: 700px) {
  .website-hero {
    min-height: 760px;
    padding-right: 14px;
    padding-left: 14px;
    border-radius: 24px;
  }

  .hero-announcement {
    gap: 7px;
  }
  .hero-announcement strong {
    display: none;
  }

  .hero-modes {
    width: 100%;
    justify-content: center;
  }

  .hero-modes a {
    padding: 0 9px;
    font-size: 11px;
  }

  .hero-availability {
    flex-wrap: wrap;
  }

  .macbook-frame {
    padding: 8px 8px 0;
    border-radius: 14px 14px 5px 5px;
  }

  .macbook-frame__screen {
    border-width: 4px 4px 7px;
  }
}
</style>
