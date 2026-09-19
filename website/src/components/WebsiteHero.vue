<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { ArrowDown, Clapperboard, Code2, ScanLine, Zap } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from '~/ui/button/Button.vue';
import WebsiteHeroShapes from '@website/components/WebsiteHeroShapes.vue';
import WebsiteMacbookDemo from '@website/components/WebsiteMacbookDemo.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { HOME_PAGE_COPY } from '@website/content/home-page';
import { detectPlatform } from '@website/lib/platform-downloads';

const { t } = useI18n();
const router = useRouter();
const platform = computed(() => (typeof navigator === 'undefined' ? 'windows' : detectPlatform(navigator)));
type HeroModeId = keyof typeof HOME_PAGE_COPY.heroModes;

const activeMode = ref<HeroModeId>('studio');
const activeHero = computed(() => HOME_PAGE_COPY.heroModes[activeMode.value]);
const modes: { id: HeroModeId; label: string; icon: Component }[] = [
  { id: 'instant', label: HOME_PAGE_COPY.modes.instant, icon: Zap },
  { id: 'studio', label: HOME_PAGE_COPY.modes.studio, icon: Clapperboard },
  { id: 'screenshot', label: HOME_PAGE_COPY.modes.screenshot, icon: ScanLine },
];

const beginInstall = () => {
  void router.push({ path: '/install', query: platform.value ? { os: platform.value } : {} });
};
</script>

<template>
  <section class="website-hero" :class="`website-hero--${activeMode}`" aria-labelledby="hero-title">
    <WebsiteHeroShapes :mode="activeMode" />
    <div class="website-hero__copy">
      <a class="hero-announcement" href="/docs/modes/screenshot">
        <span>{{ HOME_PAGE_COPY.announcement.label }}</span>
        <strong>{{ HOME_PAGE_COPY.announcement.title }}</strong>
        {{ HOME_PAGE_COPY.announcement.action }} <span aria-hidden="true">→</span>
      </a>

      <nav class="hero-modes" :aria-label="HOME_PAGE_COPY.modeNavigation">
        <button
          v-for="mode in modes"
          :key="mode.id"
          type="button"
          :class="{ 'is-active': mode.id === activeMode }"
          :aria-pressed="mode.id === activeMode"
          @click="activeMode = mode.id"
        >
          <component :is="mode.icon" aria-hidden="true" />{{ mode.label }}
        </button>
      </nav>

      <div class="hero-message-shell" aria-live="polite" aria-atomic="true">
        <Transition name="hero-message" mode="out-in">
          <div :key="activeMode" class="hero-message">
            <h1 id="hero-title">
              <template v-for="(phrase, index) in activeHero.title" :key="phrase">
                <span class="hero-title__phrase" :class="{ 'is-accent': index === activeHero.title.length - 1 }">
                  {{ phrase }}
                </span>
                {{ index < activeHero.title.length - 1 ? ' ' : '' }}
              </template>
            </h1>
            <p class="lede">{{ activeHero.description }}</p>
          </div>
        </Transition>
      </div>
      <div class="hero-actions">
        <Button :href="platform ? `/install?os=${platform}` : '/install'" size="lg" @click.prevent="beginInstall">
          <template v-if="platform" #icon><WebsitePlatformIcon :platform="platform" /></template>
          {{ t('Website.home.downloadFree') }}
        </Button>
        <a class="secondary-action" href="#modes">
          {{ HOME_PAGE_COPY.seeHowItWorks }} <ArrowDown aria-hidden="true" />
        </a>
      </div>
    </div>

    <WebsiteMacbookDemo
      :video-label="t('Website.home.demoAlt')"
      :play-label="t('Website.home.playDemo')"
      :pause-label="t('Website.home.pauseDemo')"
    />
    <div class="hero-availability">
      <strong>{{ t('Website.home.availabilityTitle') }}</strong>
      <span>{{ t('Website.home.availabilityPlatforms') }}</span>
      <a href="https://github.com/BeamRecorder/Beam" target="_blank" rel="noreferrer">
        <Code2 aria-hidden="true" />{{ t('Website.home.viewGitHub') }}
      </a>
    </div>
  </section>
</template>

<style scoped>
.website-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-height: 980px;
  margin-top: 16px;
  padding: clamp(44px, 5.5vw, 70px) clamp(20px, 5vw, 72px) 0;
  border: 1px solid rgb(82 60 43 / 11%);
  border-radius: 34px;
  background: #f5efe7;
  box-shadow: inset 0 1px rgb(255 255 255 / 82%);
  text-align: center;
  --hero-accent: #7557e8;
  --hero-accent-rgb: 117 87 232;
}

.website-hero--instant {
  --hero-accent: #ee5a2a;
  --hero-accent-rgb: 238 90 42;
}

.website-hero--screenshot {
  --hero-accent: #168a65;
  --hero-accent-rgb: 22 138 101;
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
  margin-top: 28px;
  padding: 5px;
  align-items: center;
  border: 1px solid rgb(44 61 77 / 8%);
  border-radius: 999px;
  background: rgb(255 255 255 / 72%);
  box-shadow: 0 10px 30px -24px rgb(43 70 96 / 68%);
  backdrop-filter: blur(16px);
}

.hero-modes button {
  display: inline-flex;
  min-height: 36px;
  padding: 0 14px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #716e69;
  cursor: pointer;
  font-size: 13px;
  font-weight: 620;
  transition:
    color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}

.hero-modes button:hover {
  color: #201e1a;
  transform: translateY(-1px);
}

.hero-modes button.is-active {
  background: rgb(var(--hero-accent-rgb) / 13%);
  box-shadow:
    inset 0 0 0 1px rgb(var(--hero-accent-rgb) / 7%),
    0 4px 12px rgb(var(--hero-accent-rgb) / 10%);
  color: var(--hero-accent);
}

.hero-modes svg {
  width: 15px;
  height: 15px;
}

.website-hero h1 {
  max-width: 1000px;
  margin-top: clamp(28px, 3.5vw, 44px);
  color: #171716;
  font-size: clamp(54px, 7.8vw, 108px);
  font-weight: 620;
  letter-spacing: -0.06em;
  line-height: 0.92;
}

.hero-title__phrase {
  position: relative;
  display: inline-block;
  white-space: nowrap;
}

.hero-title__phrase + .hero-title__phrase {
  margin-left: 0.12em;
}

.hero-title__phrase::after {
  position: absolute;
  top: 51%;
  right: -0.03em;
  left: -0.03em;
  height: 0.055em;
  border-radius: 999px;
  background: var(--hero-accent);
  content: '';
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
}

.hero-title__phrase.is-accent {
  color: var(--hero-accent);
}

.website-hero .lede {
  max-width: 720px;
  margin: 22px auto 0;
  color: #5b6064;
}

.hero-message-shell {
  width: 100%;
  min-height: 230px;
}

.hero-message {
  display: grid;
  justify-items: center;
}

.hero-message-leave-active {
  animation: message-leave 480ms cubic-bezier(0.58, 0, 0.28, 1) both;
}

.hero-message-leave-active .hero-title__phrase::after {
  animation: title-strike 360ms cubic-bezier(0.65, 0, 0.2, 1) both;
}

.hero-message-enter-active {
  animation: message-enter 460ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes title-strike {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes message-leave {
  0%,
  68% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-12px);
  }
}

@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hero-actions {
  justify-content: center;
}

.hero-availability {
  display: flex;
  position: relative;
  z-index: 2;
  margin: -22px auto 30px;
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

  .hero-modes button {
    padding: 0 9px;
    font-size: 11px;
  }

  .hero-message-shell {
    min-height: 300px;
  }

  .hero-availability {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-message-enter-active,
  .hero-message-leave-active,
  .hero-message-leave-active .hero-title__phrase::after {
    animation: none;
  }
}
</style>
