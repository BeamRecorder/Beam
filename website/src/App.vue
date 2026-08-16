<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Code2, ExternalLink, Play } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import WebsiteEditorPreview from '@website/components/WebsiteEditorPreview.vue';
import WebsiteHudPreview from '@website/components/WebsiteHudPreview.vue';
import { demoMedia } from '@website/demo/website-demo-fixture';
import WebsiteTopbar from '@website/components/WebsiteTopbar.vue';
import InstallConfirmation from '@website/components/InstallConfirmation.vue';
import type { WebsitePlatform } from '@website/lib/platform-downloads';
import { useGitHubRepository } from '@website/composables/useGitHubRepository';
import discordIconUrl from '../../public/discord_svg.svg';
import { useI18n } from 'vue-i18n';

const editorRef = ref<InstanceType<typeof WebsiteEditorPreview> | null>(null);
const route = ref(window.location.pathname);
const installPlatform = ref<WebsitePlatform>('windows');
const installAutoStart = ref(false);
const installViewKey = ref(0);
const github = useGitHubRepository();
const { t } = useI18n();
const contributorLabel = computed(() => {
  const count = github.contributorCount.value;
  return count === null ? t('Website.home.contributorsFallback') : t('Website.home.contributors', { count }, count);
});

const platformFromUrl = (): WebsitePlatform => {
  const value = new URLSearchParams(window.location.search).get('os');
  return value === 'macos' || value === 'linux' || value === 'windows' ? value : 'windows';
};

const syncRoute = () => {
  route.value = window.location.pathname.replace(/\/+$/, '') || '/';
  const queryPlatform = platformFromUrl();
  if (new URLSearchParams(window.location.search).has('os')) {
    installPlatform.value = queryPlatform;
    installAutoStart.value = true;
  } else {
    installAutoStart.value = false;
  }
};

const goHome = () => {
  window.history.pushState({}, '', '/');
  syncRoute();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const beginInstall = (platform: WebsitePlatform | null) => {
  installPlatform.value = platform ?? 'windows';
  installAutoStart.value = Boolean(platform);
  window.history.pushState({}, '', platform ? `/install?os=${platform}` : '/install');
  syncRoute();
  installViewKey.value += 1;
  window.scrollTo({ top: 0 });
};

onMounted(() => {
  syncRoute();
  void github.load();
  window.addEventListener('popstate', syncRoute);
});
onBeforeUnmount(() => window.removeEventListener('popstate', syncRoute));

const playDemo = () => {
  document.querySelector('#editor-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  void editorRef.value?.play();
};

const openExternal = (url: string) => window.open(url, '_blank', 'noopener');
</script>

<template>
  <WebsiteTopbar @install="beginInstall" @home="goHome" />
  <Transition name="page" mode="out-in">
    <InstallConfirmation
      v-if="route === '/install'"
      :key="`install-${installViewKey}`"
      :platform="installPlatform"
      :auto-start="installAutoStart"
    />

    <div v-else key="home" class="site-shell">
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
          <WebsiteHudPreview @play="playDemo" />
        </section>

        <section id="editor-demo" class="content-section">
          <WebsiteEditorPreview ref="editorRef" />
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

      <footer>
        <span>Beam</span>
        <span>{{ t('Website.home.footer') }}</span>
      </footer>
    </div>
  </Transition>
</template>
