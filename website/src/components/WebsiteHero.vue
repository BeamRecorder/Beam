<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { ArrowDown, Clapperboard, Code2, ScanLine, Zap } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from '~/ui/button/Button.vue';
import WebsiteHeroShapes from '@website/components/WebsiteHeroShapes.vue';
import WebsiteMacbookDemo from '@website/components/WebsiteMacbookDemo.vue';
import WebsiteModeMessage from '@website/components/WebsiteModeMessage.vue';
import WebsiteModeTabs from '@website/components/WebsiteModeTabs.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { HOME_PAGE_COPY } from '@website/content/home-page';
import { detectPlatform } from '@website/lib/platform-downloads';
import type { WebsiteModeId, WebsiteModeOption } from '@website/types/website-modes';

const { t } = useI18n();
const router = useRouter();
const platform = computed(() => (typeof navigator === 'undefined' ? 'windows' : detectPlatform(navigator)));
const activeMode = defineModel<WebsiteModeId>('mode', { default: 'studio' });
const activeHero = computed(() => HOME_PAGE_COPY.heroModes[activeMode.value]);
const modes: WebsiteModeOption[] = [
  { id: 'instant', label: HOME_PAGE_COPY.modes.instant, icon: Zap },
  { id: 'studio', label: HOME_PAGE_COPY.modes.studio, icon: Clapperboard },
  { id: 'screenshot', label: HOME_PAGE_COPY.modes.screenshot, icon: ScanLine },
];

const beginInstall = () => {
  void router.push({ path: '/install', query: platform.value ? { os: platform.value } : {} });
};

const openFeatureExplorer = async () => {
  activeMode.value = 'screenshot';
  await nextTick();

  const explorer = document.getElementById('editor-demo');
  if (!explorer) return;

  window.history.pushState(null, '', '#editor-demo');
  explorer.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
};
</script>

<template>
  <section class="website-hero" :class="`website-hero--${activeMode}`" aria-labelledby="hero-title">
    <WebsiteHeroShapes :mode="activeMode" />
    <div class="website-hero__copy">
      <a class="hero-announcement" href="#editor-demo" @click.prevent="openFeatureExplorer">
        <span>{{ HOME_PAGE_COPY.announcement.label }}</span>
        <strong>{{ HOME_PAGE_COPY.announcement.title }}</strong>
        {{ HOME_PAGE_COPY.announcement.action }} <span aria-hidden="true">→</span>
      </a>

      <WebsiteModeTabs v-model="activeMode" class="hero-modes" :label="HOME_PAGE_COPY.modeNavigation" :modes="modes" />

      <WebsiteModeMessage
        class="hero-message-shell"
        :mode="activeMode"
        :title="activeHero.title"
        :description="activeHero.description"
        heading="h1"
        heading-id="hero-title"
      />
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
  margin-top: 28px;
  --mode-accent: var(--hero-accent);
  --mode-accent-rgb: var(--hero-accent-rgb);
}

.hero-message-shell {
  --mode-accent: var(--hero-accent);
  --mode-message-heading-margin: clamp(28px, 3.5vw, 44px) 0 0;
  --mode-message-heading-size: clamp(54px, 7.8vw, 108px);
  --mode-message-min-height: 230px;
}

.hero-actions {
  justify-content: center;
}

.hero-availability {
  display: flex;
  position: relative;
  z-index: 2;
  margin: 18px auto 30px;
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

  .hero-message-shell {
    --mode-message-heading-size: clamp(40px, 12vw, 48px);
    --mode-message-min-height: 300px;
    --mode-message-description-size: 17px;
  }

  .hero-availability {
    flex-wrap: wrap;
  }
}
</style>
