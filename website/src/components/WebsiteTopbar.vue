<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { BookOpen, CircleHelp, Download, Star } from '@lucide/vue';
import { useGitHubRepository } from '@website/composables/useGitHubRepository';
import { detectPlatform, type WebsitePlatform } from '@website/lib/platform-downloads';
import beamIconUrl from '../assets/beam-icon-72.webp';
import discordIconUrl from '../../../public/discord_svg.svg';
import githubIconUrl from '../../../public/github.svg';
import WebsiteThemeSelector from '@website/components/WebsiteThemeSelector.vue';
import WebsiteLanguageSelector from '@website/components/WebsiteLanguageSelector.vue';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ install: [platform: WebsitePlatform | null]; home: [] }>();
const github = useGitHubRepository();
const { t } = useI18n();
const platform = computed(() => (typeof navigator === 'undefined' ? 'windows' : detectPlatform(navigator)));

onMounted(() => void github.loadStars());
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="/" :aria-label="t('Website.nav.homeAria')" @click.prevent="emit('home')">
        <img :src="beamIconUrl" alt="" />
        <span>Beam</span>
      </a>

      <nav class="site-nav" :aria-label="t('Website.nav.mainAria')">
        <a href="/docs/">
          <BookOpen aria-hidden="true" />
          <span>{{ t('Website.nav.docs') }}</span>
        </a>
        <a href="/faq">
          <CircleHelp aria-hidden="true" />
          <span>FAQ</span>
        </a>
        <a
          class="github-stars"
          href="https://github.com/BeamRecorder/Beam"
          target="_blank"
          rel="noreferrer"
          :aria-label="t('Website.nav.starAria')"
        >
          <img class="github-icon" :src="githubIconUrl" alt="" />
          <span>{{ t('Website.nav.star') }}</span>
          <strong :aria-label="t('Website.nav.starsAria')">{{ github.stars.value ?? '...' }}</strong>
          <Star aria-hidden="true" />
        </a>
        <a class="discord-link" href="https://discord.gg/6Q6v2xUCB" target="_blank" rel="noreferrer">
          <img :src="discordIconUrl" alt="" />
          <span>Discord</span>
        </a>
      </nav>

      <div class="header-actions">
        <ClientOnly>
          <WebsiteLanguageSelector />
          <span class="header-theme-control"><WebsiteThemeSelector /></span>
          <template #placeholder><span class="selector-placeholder" aria-hidden="true" /></template>
        </ClientOnly>
        <a
          class="install-button"
          :href="platform ? `/install?os=${platform}` : '/install'"
          @click.prevent="emit('install', platform)"
        >
          <WebsitePlatformIcon v-if="platform" :platform="platform" />
          <span>{{ t('Website.nav.install') }}</span>
          <Download aria-hidden="true" />
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  width: 100%;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-header);
  backdrop-filter: blur(20px) saturate(135%);
  box-shadow: inset 0 1px var(--color-header-edge);
}
.site-header__inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  width: min(100% - 40px, 1240px);
  min-height: 72px;
  margin: 0 auto;
}
.brand,
.site-nav,
.site-nav a,
.header-actions,
.install-button {
  display: flex;
  align-items: center;
}
.header-actions {
  justify-self: end;
  gap: 8px;
}
.selector-placeholder {
  width: 92px;
  height: 42px;
}
.brand {
  gap: 10px;
  width: fit-content;
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 20px;
  font-weight: 760;
  text-decoration: none;
}
.brand img {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}
.site-nav {
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-header-control);
}
.site-nav a {
  gap: 7px;
  min-height: 38px;
  padding: 0 11px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  transition:
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}
.site-nav a:hover {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}
.site-nav a:active,
.install-button:active {
  transform: translateY(1px);
}
.site-nav svg,
.discord-link img,
.github-icon {
  width: 16px;
  height: 16px;
}
.discord-link img {
  filter: var(--brand-icon-filter);
  opacity: 0.82;
}
.github-icon {
  filter: var(--brand-icon-filter);
  opacity: 0.78;
}
.github-stars strong {
  min-width: 18px;
  padding-left: 8px;
  border-left: 1px solid var(--color-border);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.github-stars svg:last-child {
  width: 13px;
  color: var(--color-primary);
}
.install-button {
  gap: 9px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid var(--color-primary-border);
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 14px;
  font-weight: 780;
  text-decoration: none;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.24);
  transition:
    background 160ms ease,
    transform 160ms ease;
}
.install-button:hover {
  background: var(--color-primary-hover);
}
.install-button .platform-icon,
.install-button svg {
  width: 17px;
  height: 17px;
}
@media (max-width: 959px) {
  .site-header__inner {
    grid-template-columns: auto 1fr auto;
    width: min(100% - 24px, 1240px);
    gap: 12px;
  }
  .site-nav {
    justify-self: end;
  }
  .site-nav a:not(.github-stars) {
    display: none;
  }
  .github-stars > span,
  .github-stars > svg:first-child {
    display: none;
  }
}
@media (max-width: 639px) {
  .site-header__inner {
    grid-template-columns: auto 1fr;
  }
  .site-nav {
    display: none;
  }
  .selector-placeholder {
    width: 42px;
  }
  .header-theme-control {
    display: none;
  }
}
@media (max-width: 480px) {
  .brand span,
  .install-button svg,
  .github-stars svg:last-child {
    display: none;
  }
  .install-button {
    padding: 0 11px;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .site-header {
    background: var(--color-bg-header-solid);
    backdrop-filter: none;
  }
}
</style>
