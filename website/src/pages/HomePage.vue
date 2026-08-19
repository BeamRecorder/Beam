<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Code2, Download, ExternalLink, Play } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import WebsiteEditorPreview from '@website/components/WebsiteEditorPreview.vue';
import WebsiteCommunityShader from '@website/components/WebsiteCommunityShader.vue';
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
          <p class="hero-eyebrow">{{ t('Website.home.heroEyebrow') }}</p>
          <h1 id="hero-title">{{ t('Website.home.heroLine1') }}</h1>
          <p class="lede">{{ t('Website.home.lede') }}</p>
          <div class="hero-actions">
            <a class="hero-primary-action" href="/install">
              <Download aria-hidden="true" /> {{ t('Website.home.downloadFree') }}
            </a>
            <a class="secondary-action" href="https://github.com/BeamRecorder/Beam" target="_blank" rel="noreferrer">
              <Code2 aria-hidden="true" /> {{ t('Website.home.viewGitHub') }}
            </a>
          </div>
        </div>
        <button class="hero-media" type="button" :aria-label="t('Website.home.playDemoAria')" @click="playDemo">
          <img :src="demoMedia.thumbnailUrl" :alt="t('Website.home.demoAlt')" />
          <span><Play aria-hidden="true" /> {{ t('Website.home.openDemo') }}</span>
        </button>
      </section>

      <section class="availability" aria-label="Beam availability">
        <strong>{{ t('Website.home.availabilityTitle') }}</strong>
        <span>{{ t('Website.home.availabilityPlatforms') }}</span>
      </section>

      <section id="editor-demo" class="content-section">
        <div class="section-intro">
          <h2>{{ t('Website.home.editorTitle') }}</h2>
          <p>{{ t('Website.home.editorText') }}</p>
        </div>
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

      <section class="open-source">
        <WebsiteCommunityShader class="open-source__shader" />
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
            loading="lazy"
          />
          <span>{{ contributorLabel }}</span>
        </a>
      </section>
    </main>
  </div>
</template>

<style scoped>
.hero h1 {
  word-spacing: 0.12em;
}
</style>
