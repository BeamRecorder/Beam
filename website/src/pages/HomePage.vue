<script setup lang="ts">
import { computed } from 'vue';
import { Code2, ExternalLink } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsiteFeatureSection from '@website/components/WebsiteFeatureSection.vue';
import WebsiteHero from '@website/components/WebsiteHero.vue';
import WebsiteShaderPanel from '@website/components/WebsiteShaderPanel.vue';
import { createHomeJsonLd } from '@website/seo/json-ld';
import { usePageSeo } from '@website/seo/use-page-seo';
import type { WebsiteFeature } from '@website/types/website-features';
import discordIconUrl from '../../../public/discord_svg.svg';

const { t } = useI18n();

const features = computed<WebsiteFeature[]>(() => [
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
    title: t('Website.home.featureEditor'),
    media: {
      type: 'image',
      src: '/features/editor.webp',
      srcset: '/features/editor.webp 800w',
      sizes: '(max-width: 760px) calc(100vw - 48px), 600px',
      width: 800,
      height: 500,
      fit: 'contain',
      containShape: 'landscape',
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
      width: 640,
      height: 640,
    },
  },
  {
    title: t('Website.home.featureZoomControls'),
    media: {
      type: 'image',
      src: '/features/zooms-640.webp',
      srcset: '/features/zooms-640.webp 640w, /features/zooms-960.webp 960w',
      sizes: '(max-width: 760px) calc(100vw - 24px), 390px',
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
  {
    title: t('Website.home.featureExport'),
    media: {
      type: 'image',
      src: '/features/export-settings-640.webp',
      srcset: '/features/export-settings-640.webp 640w, /features/export-settings-960.webp 960w',
      sizes: '(max-width: 760px) calc(100vw - 24px), 640px',
      width: 640,
      height: 640,
    },
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
      <WebsiteHero />

      <WebsiteFeatureSection
        id="editor-demo"
        :title="t('Website.home.featuresTitle')"
        :description="t('Website.home.featuresText')"
        :features="features"
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
