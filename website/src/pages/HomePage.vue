<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Code2, ExternalLink, Play } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsiteEditorPreview from '@website/components/WebsiteEditorPreview.vue';
import WebsiteHudPreview from '@website/components/WebsiteHudPreview.vue';
import { useGitHubRepository } from '@website/composables/useGitHubRepository';
import { demoMedia } from '@website/demo/website-demo-fixture';
import { createHomeJsonLd } from '@website/seo/json-ld';
import { usePageSeo } from '@website/seo/use-page-seo';
import discordIconUrl from '../../../public/discord_svg.svg';

const editorRef = ref<InstanceType<typeof WebsiteEditorPreview> | null>(null);
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

const playDemo = () => {
  document.querySelector('#editor-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  void editorRef.value?.play();
};

const openExternal = (url: string) => window.open(url, '_blank', 'noopener');
</script>

<template>
  <div class="site-shell">
    <main id="top">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <h1 id="hero-title">{{ t('Website.home.heroLine1') }}<br />{{ t('Website.home.heroLine2') }}</h1>
          <p class="lede">{{ t('Website.home.lede') }}</p>
          <div class="hero-actions">
            <Button size="lg" :icon="Play" @click="playDemo">{{ t('Website.home.watchDemo') }}</Button>
            <a class="secondary-action" href="https://github.com/ExtraBinoss/Beam" target="_blank" rel="noreferrer">
              <Code2 aria-hidden="true" /> {{ t('Website.home.viewSource') }}
            </a>
          </div>
        </div>
        <button class="hero-media" type="button" :aria-label="t('Website.home.playDemoAria')" @click="playDemo">
          <img :src="demoMedia.thumbnailUrl" :alt="t('Website.home.demoAlt')" />
          <span><Play aria-hidden="true" /> {{ t('Website.home.openDemo') }}</span>
        </button>
      </section>

      <section id="capture" class="content-section">
        <ClientOnly>
          <WebsiteHudPreview @play="playDemo" />
          <template #placeholder>
            <article class="demo-placeholder">
              <h2>Record a display, window, or custom region.</h2>
              <p>Keep microphone, system audio, and webcam sources on separate tracks for focused editing.</p>
            </article>
          </template>
        </ClientOnly>
      </section>

      <section id="editor-demo" class="content-section">
        <ClientOnly>
          <WebsiteEditorPreview ref="editorRef" />
          <template #placeholder>
            <article class="demo-placeholder">
              <h2>Polish timing, zooms, captions, and presentation.</h2>
              <p>Beam keeps the original capture intact while you shape the final product demo.</p>
            </article>
          </template>
        </ClientOnly>
      </section>

      <section class="open-source">
        <div class="open-source__copy">
          <h2>{{ t('Website.home.openSourceTitle') }}</h2>
          <p>{{ t('Website.home.openSourceText') }}</p>
          <div class="open-source__actions">
            <Button variant="secondary" :icon="Code2" @click="openExternal('https://github.com/ExtraBinoss/Beam')">
              {{ t('Website.home.viewGitHub') }}
            </Button>
            <Button class="discord-join" variant="secondary" @click="openExternal('https://discord.gg/6Q6v2xUCB')">
              <img :src="discordIconUrl" alt="" />
              {{ t('Website.home.joinDiscord') }}
              <ExternalLink aria-hidden="true" />
            </Button>
          </div>
        </div>
        <a
          class="contributors"
          href="https://github.com/ExtraBinoss/Beam/graphs/contributors"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="https://contrib.rocks/image?repo=ExtraBinoss/Beam"
            :alt="t('Website.home.contributorsAlt')"
            loading="lazy"
          />
          <span>{{ contributorLabel }}</span>
        </a>
      </section>
    </main>
  </div>
</template>
