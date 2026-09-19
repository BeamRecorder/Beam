<script setup lang="ts">
import { computed, ref } from 'vue';
import { Clapperboard, ClipboardPaste, Code2, Crop, ExternalLink, PenTool, ScanLine, Zap } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsiteFeatureSection from '@website/components/WebsiteFeatureSection.vue';
import WebsiteHero from '@website/components/WebsiteHero.vue';
import WebsiteModeCards from '@website/components/WebsiteModeCards.vue';
import WebsiteModeSpotlight from '@website/components/WebsiteModeSpotlight.vue';
import WebsiteShaderPanel from '@website/components/WebsiteShaderPanel.vue';
import { HOME_PAGE_COPY } from '@website/content/home-page';
import { createHomeJsonLd } from '@website/seo/json-ld';
import { usePageSeo } from '@website/seo/use-page-seo';
import type { WebsiteFeatureGroups } from '@website/types/website-features';
import type { WebsiteModeId, WebsiteModeSpotlightContent, WebsiteModeSummary } from '@website/types/website-modes';
import discordIconUrl from '../../../public/discord_svg.svg';

const { t } = useI18n();
const activeMode = ref<WebsiteModeId>('studio');

const featureGroups = computed<WebsiteFeatureGroups>(() => ({
  instant: {
    ...HOME_PAGE_COPY.featureExplorer.modes.instant,
    features: [
      {
        title: t('Website.home.featureRecorder'),
        media: {
          type: 'image',
          src: '/features/recorder.webp',
          srcset: '/features/recorder.webp 320w',
          sizes: '(max-width: 760px) 320px, 420px',
          width: 320,
          height: 480,
          fit: 'contain',
          containShape: 'portrait',
          backdrop: '/features/product-backdrop.webp',
        },
      },
      {
        title: t('Website.home.featureBackgrounds'),
        media: {
          type: 'image',
          src: '/features/backgrounds-640.webp',
          srcset: '/features/backgrounds-640.webp 640w, /features/backgrounds-960.webp 960w',
          sizes: '(max-width: 760px) calc(100vw - 24px), 390px',
          mobileSrc: '/features/backgrounds-400.webp',
          width: 640,
          height: 640,
        },
      },
      {
        title: t('Website.home.featureExport'),
        media: {
          type: 'image',
          src: '/features/export-settings-640.webp',
          srcset: '/features/export-settings-640.webp 640w, /features/export-settings-960.webp 960w',
          sizes: '(max-width: 760px) calc(100vw - 24px), 640px',
          mobileSrc: '/features/export-settings-400.webp',
          width: 640,
          height: 640,
        },
      },
    ],
  },
  studio: {
    ...HOME_PAGE_COPY.featureExplorer.modes.studio,
    features: [
      {
        title: t('Website.home.featureEditor'),
        media: {
          type: 'image',
          src: '/features/editor.webp',
          srcset: '/features/editor.webp 800w',
          sizes: '(max-width: 760px) calc(100vw - 48px), 600px',
          mobileSrc: '/features/editor-400.webp',
          width: 800,
          height: 500,
          fit: 'contain',
          containShape: 'landscape',
          backdrop: '/features/product-backdrop.webp',
        },
      },
      {
        title: t('Website.home.featureZoomControls'),
        media: {
          type: 'image',
          src: '/features/zooms-640.webp',
          srcset: '/features/zooms-640.webp 640w, /features/zooms-960.webp 960w',
          sizes: '(max-width: 760px) calc(100vw - 24px), 390px',
          mobileSrc: '/features/zooms-400.webp',
          width: 640,
          height: 640,
        },
      },
      {
        title: t('Website.home.feature3dZooms'),
        media: {
          type: 'video',
          src: '/features/tilt-zoom-full.webm',
          poster: '/features/tilt-zoom-full-poster.webp',
          width: 1280,
          height: 720,
        },
      },
    ],
  },
  screenshot: {
    ...HOME_PAGE_COPY.featureExplorer.modes.screenshot,
    features: [
      {
        title: HOME_PAGE_COPY.featureExplorer.screenshotFeatures.crop,
        media: { type: 'placeholder', label: 'Screenshot crop feature media', icon: Crop },
      },
      {
        title: HOME_PAGE_COPY.featureExplorer.screenshotFeatures.annotate,
        media: { type: 'placeholder', label: 'Screenshot annotation feature media', icon: PenTool },
      },
      {
        title: HOME_PAGE_COPY.featureExplorer.screenshotFeatures.clipboard,
        media: { type: 'placeholder', label: 'Screenshot clipboard feature media', icon: ClipboardPaste },
      },
    ],
  },
}));

const modes = computed<WebsiteModeSummary[]>(() => [
  {
    id: 'instant',
    label: HOME_PAGE_COPY.modes.instant,
    title: HOME_PAGE_COPY.cards.instant.title,
    description: HOME_PAGE_COPY.cards.instant.text,
    bestFor: HOME_PAGE_COPY.cards.instant.bestFor,
    icon: Zap,
    tone: 'blue',
    steps: HOME_PAGE_COPY.cards.instant.steps,
  },
  {
    id: 'studio',
    label: HOME_PAGE_COPY.modes.studio,
    title: HOME_PAGE_COPY.cards.studio.title,
    description: HOME_PAGE_COPY.cards.studio.text,
    bestFor: HOME_PAGE_COPY.cards.studio.bestFor,
    icon: Clapperboard,
    tone: 'violet',
    steps: HOME_PAGE_COPY.cards.studio.steps,
  },
  {
    id: 'screenshot',
    label: HOME_PAGE_COPY.modes.screenshot,
    title: HOME_PAGE_COPY.cards.screenshot.title,
    description: HOME_PAGE_COPY.cards.screenshot.text,
    bestFor: HOME_PAGE_COPY.cards.screenshot.bestFor,
    icon: ScanLine,
    tone: 'green',
    steps: HOME_PAGE_COPY.cards.screenshot.steps,
  },
]);

const modeSpotlights = computed<WebsiteModeSpotlightContent[]>(() => [
  {
    id: 'instant',
    eyebrow: HOME_PAGE_COPY.spotlights.instant.eyebrow,
    icon: Zap,
    title: HOME_PAGE_COPY.spotlights.instant.title,
    description: HOME_PAGE_COPY.spotlights.instant.text,
    tone: 'blue',
    media: 'instant',
    features: HOME_PAGE_COPY.spotlights.instant.features,
  },
  {
    id: 'studio',
    eyebrow: HOME_PAGE_COPY.spotlights.studio.eyebrow,
    icon: Clapperboard,
    title: HOME_PAGE_COPY.spotlights.studio.title,
    description: HOME_PAGE_COPY.spotlights.studio.text,
    tone: 'violet',
    media: 'studio',
    reverse: true,
    features: HOME_PAGE_COPY.spotlights.studio.features,
  },
  {
    id: 'screenshot',
    eyebrow: HOME_PAGE_COPY.spotlights.screenshot.eyebrow,
    icon: ScanLine,
    title: HOME_PAGE_COPY.spotlights.screenshot.title,
    description: HOME_PAGE_COPY.spotlights.screenshot.text,
    tone: 'green',
    media: 'screenshot',
    features: HOME_PAGE_COPY.spotlights.screenshot.features,
  },
]);

usePageSeo({
  path: '/',
  title: computed(() => t('Website.meta.title')),
  description: computed(() => t('Website.meta.description')),
  jsonLd: createHomeJsonLd(),
});

const openExternal = (url: string) => window.open(url, '_blank', 'noopener');
</script>

<template>
  <div class="site-shell">
    <main id="top">
      <WebsiteHero v-model:mode="activeMode" />

      <WebsiteModeCards
        :title="HOME_PAGE_COPY.overview.title"
        :description="HOME_PAGE_COPY.overview.text"
        :modes="modes"
      />

      <WebsiteModeSpotlight v-for="mode in modeSpotlights" :key="mode.id" :content="mode" />

      <WebsiteFeatureSection
        v-model:mode="activeMode"
        id="editor-demo"
        :title="HOME_PAGE_COPY.featureExplorer.title"
        :mode-navigation="HOME_PAGE_COPY.featureExplorer.modeNavigation"
        :modes="modes"
        :groups="featureGroups"
      />

      <section class="free-statement" aria-labelledby="free-title">
        <div>
          <h2 id="free-title">{{ t('Website.home.freeTitle') }}</h2>
          <p>{{ t('Website.home.freeText') }}</p>
        </div>
        <ul>
          <li>{{ t('Website.home.freeSubscription') }}</li>
          <li>{{ t('Website.home.freeOpenSource') }}</li>
          <li>{{ t('Website.home.freePlatforms') }}</li>
        </ul>
      </section>

      <WebsiteShaderPanel as="section" class="open-source">
        <div class="open-source__copy">
          <h2>{{ t('Website.home.openSourceTitle') }}</h2>
          <p>{{ t('Website.home.openSourceText') }}</p>
          <div class="open-source__actions">
            <Button variant="frosted" :icon="Code2" @click="openExternal('https://github.com/BeamRecorder/Beam')">
              {{ t('Website.home.viewGitHub') }}
            </Button>
            <Button class="discord-join" variant="frosted" @click="openExternal('https://discord.gg/6Q6v2xUCB')">
              <img :src="discordIconUrl" alt="" />
              {{ t('Website.home.joinDiscord') }}
              <ExternalLink aria-hidden="true" />
            </Button>
          </div>
        </div>
        <a
          class="contributors"
          href="https://github.com/BeamRecorder/Beam/graphs/contributors"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="/beam-contributors.svg"
            :alt="t('Website.home.contributorsAlt')"
            width="200"
            height="64"
            loading="lazy"
            decoding="async"
          />
          <span>{{ t('Website.home.contributorsFallback') }}</span>
        </a>
      </WebsiteShaderPanel>
    </main>
  </div>
</template>
