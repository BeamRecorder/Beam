<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Code2, ExternalLink } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsiteHero from '@website/components/WebsiteHero.vue';
import WebsiteShaderPanel from '@website/components/WebsiteShaderPanel.vue';
import { useGitHubRepository } from '@website/composables/useGitHubRepository';
import { createHomeJsonLd } from '@website/seo/json-ld';
import { usePageSeo } from '@website/seo/use-page-seo';
import discordIconUrl from '../../../public/discord_svg.svg';

const github = useGitHubRepository();
const { t } = useI18n();
onMounted(() => void github.load());
const contributorLabel = computed(() => {
  const count = github.contributorCount.value;
  return count === null ? t('Website.home.contributorsFallback') : t('Website.home.contributors', { count }, count);
});

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

      <section id="editor-demo" class="content-section showcase-section">
        <div class="section-intro">
          <h2>{{ t('Website.home.editorTitle') }}</h2>
          <p>{{ t('Website.home.editorText') }}</p>
        </div>
        <img
          class="showcase-image"
          src="/Beam-showcase-1200.webp"
          srcset="
            /Beam-showcase-480.webp   480w,
            /Beam-showcase-800.webp   800w,
            /Beam-showcase-1200.webp 1200w,
            /Beam-showcase-1672.webp 1672w
          "
          sizes="(max-width: 620px) calc(100vw - 24px), min(calc(100vw - 40px), 1440px)"
          :alt="t('Website.home.showcaseAlt')"
          width="1672"
          height="941"
          loading="lazy"
          decoding="async"
        />
      </section>

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
            src="https://contrib.rocks/image?repo=BeamRecorder/Beam"
            :alt="t('Website.home.contributorsAlt')"
            width="314"
            height="48"
            loading="lazy"
          />
          <span>{{ contributorLabel }}</span>
        </a>
      </WebsiteShaderPanel>
    </main>
  </div>
</template>
