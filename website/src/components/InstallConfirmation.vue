<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Download, ExternalLink } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useGitHubRepository } from '@website/composables/useGitHubRepository';
import WebsitePlatformIcon from '@website/components/WebsitePlatformIcon.vue';
import {
  assetForPlatform,
  downloadSizeInMegabytes,
  PLATFORM_DETAILS,
  type WebsitePlatform,
} from '@website/lib/platform-downloads';
import discordIconUrl from '../../../public/discord_svg.svg';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ platform: WebsitePlatform; autoStart: boolean }>();
const github = useGitHubRepository();
const { t } = useI18n();
const selectedPlatform = ref(props.platform);
const downloadStarted = ref(false);
const autoStartPending = ref(props.autoStart);

const platforms = Object.keys(PLATFORM_DETAILS) as WebsitePlatform[];
const selectedDetails = computed(() => PLATFORM_DETAILS[selectedPlatform.value]);
const selectedAsset = computed(() =>
  github.release.value ? assetForPlatform(github.release.value.assets, selectedPlatform.value) : null,
);
const version = computed(() => github.release.value?.tag_name ?? '');
const titleKey = computed(() =>
  downloadStarted.value
    ? 'Website.install.downloadingTitle'
    : github.loading.value
      ? 'Website.install.preparingTitle'
      : 'Website.install.downloadTitle',
);
const title = computed(() =>
  t(titleKey.value, {
    version: version.value,
    platform: selectedDetails.value.label,
  }).replace(/\s{2,}/g, ' '),
);
const titleParts = computed(() => {
  const versionIndex = version.value ? title.value.indexOf(version.value) : -1;
  if (versionIndex === -1) return { before: title.value, version: '', after: '' };
  return {
    before: title.value.slice(0, versionIndex),
    version: version.value,
    after: title.value.slice(versionIndex + version.value.length),
  };
});
const platformSupport = (platform: WebsitePlatform) => t(`Website.platform.${platform}Support`);
const platformFormat = (platform: WebsitePlatform) => t(`Website.platform.${platform}Format`);
const downloadSize = (platform: WebsitePlatform) => {
  const bytes = github.release.value ? (assetForPlatform(github.release.value.assets, platform)?.size ?? 0) : 0;
  const count = downloadSizeInMegabytes(bytes);
  return count === null ? t('Website.platform.sizeUnavailable') : t('Website.platform.megabytes', { count });
};

const startDownload = (platform = selectedPlatform.value) => {
  selectedPlatform.value = platform;
  const release = github.release.value;
  const asset = release ? assetForPlatform(release.assets, platform) : null;
  if (!asset) return;
  downloadStarted.value = true;
  window.history.replaceState({}, '', `/install?os=${platform}`);
  const link = document.createElement('a');
  link.href = asset.browser_download_url;
  link.download = asset.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const openRelease = () => window.open('https://github.com/ExtraBinoss/Beam/releases/latest', '_blank', 'noopener');
const openDiscord = () => window.open('https://discord.gg/6Q6v2xUCB', '_blank', 'noopener');

watch(
  () => github.release.value,
  (release) => {
    if (!release || !autoStartPending.value) return;
    autoStartPending.value = false;
    startDownload();
  },
  { immediate: true },
);

watch(
  () => props.platform,
  (platform) => {
    selectedPlatform.value = platform;
  },
);

onMounted(() => void github.load());
</script>

<template>
  <main class="install-page">
    <section class="install-intro" aria-labelledby="install-title">
      <h1 id="install-title" :aria-label="title">
        <span class="install-title__copy">
          <span>{{ titleParts.before }}</span
          ><span class="release-version">{{ titleParts.version }}</span
          ><span>{{ titleParts.after }}</span>
        </span>
        <WebsitePlatformIcon class="title-platform-icon" :platform="selectedPlatform" />
      </h1>
      <p>
        <template v-if="github.release.value">
          {{ t('Website.install.automatic') }}
        </template>
        <template v-else-if="github.error.value">
          {{ t('Website.install.githubUnavailable') }}
        </template>
        <template v-else>{{ t('Website.install.checkingRelease') }}</template>
      </p>
      <div class="install-actions">
        <Button v-if="selectedAsset" size="lg" :icon="Download" @click="startDownload()">
          {{ t(`Website.install.${downloadStarted ? 'downloadAgain' : 'startDownload'}`) }}
        </Button>
        <Button v-else-if="github.loading.value" size="lg" loading disabled>
          {{ t('Website.install.checkingGitHub') }}
        </Button>
        <Button size="lg" variant="secondary" :icon="ExternalLink" @click="openRelease">
          {{ t('Website.install.viewRelease') }}
        </Button>
      </div>
    </section>

    <section class="platform-choices" aria-labelledby="platform-title">
      <div class="section-heading">
        <h2 id="platform-title">{{ t('Website.install.anotherVersion') }}</h2>
        <p>{{ t('Website.install.choosePackage') }}</p>
      </div>
      <div class="platform-grid">
        <Button
          v-for="platform in platforms"
          :key="platform"
          variant="card"
          class="platform-card"
          :class="{
            'platform-card--selected': platform === selectedPlatform,
            'platform-card--featured': platform === selectedPlatform,
          }"
          @click="startDownload(platform)"
        >
          <span class="platform-card__icon"><WebsitePlatformIcon :platform="platform" /></span>
          <span class="platform-card__copy">
            <strong>{{ PLATFORM_DETAILS[platform].label }}</strong>
            <small>{{ platformSupport(platform) }}</small>
          </span>
          <span class="platform-card__meta">
            <span>{{ platformFormat(platform) }}</span>
            <small v-if="github.release.value">
              {{ downloadSize(platform) }}
            </small>
          </span>
        </Button>
      </div>
    </section>

    <aside class="community-callout">
      <img :src="discordIconUrl" alt="" />
      <div class="community-callout__copy">
        <strong>{{ t('Website.install.communityTitle') }}</strong>
        <p>{{ t('Website.install.communityText') }}</p>
      </div>
      <Button class="discord-action" variant="secondary" @click="openDiscord">
        {{ t('Website.install.joinDiscord') }} <ExternalLink aria-hidden="true" />
      </Button>
    </aside>
  </main>
</template>

<style scoped>
.install-page {
  width: min(100% - 40px, 1100px);
  min-height: calc(100dvh - 72px);
  margin: 0 auto;
  padding: clamp(36px, 7vw, 88px) 0 72px;
}
.install-actions,
.community-callout,
.platform-card,
.platform-card__meta {
  display: flex;
  align-items: center;
}
.install-intro {
  display: grid;
  justify-items: center;
  max-width: 760px;
  margin: clamp(42px, 7vw, 78px) auto 0;
  text-align: center;
}
h1 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 2vw, 22px);
  max-width: 740px;
  font-family: var(--font-headline);
  font-size: clamp(42px, 7vw, 74px);
  font-weight: 720;
  letter-spacing: -0.05em;
  line-height: 1;
}
.title-platform-icon {
  width: clamp(38px, 5vw, 58px);
  height: clamp(38px, 5vw, 58px);
}
.release-version {
  display: inline-block;
  margin-inline: 0.1em 0.06em;
  letter-spacing: 0.015em;
}
.install-intro > p {
  max-width: 610px;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 18px;
}
.install-actions {
  gap: 12px;
  margin-top: 30px;
}
.platform-choices {
  margin-top: clamp(72px, 10vw, 112px);
}
.section-heading {
  max-width: 620px;
}
.section-heading h2 {
  font-size: clamp(30px, 4vw, 44px);
}
.section-heading p {
  margin-top: 10px;
  color: var(--text-secondary);
}
.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 28px;
}
:deep(.platform-card) {
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  min-height: 232px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-element);
  color: var(--text-primary);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}
:deep(.platform-card .btn-content) {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  min-width: 0;
  height: 100%;
}
:deep(.platform-card:hover) {
  border-color: var(--color-border-strong);
  background: var(--color-bg-surface-hover);
}
:deep(.platform-card:active) {
  transform: translateY(1px);
}
:deep(.platform-card--selected) {
  border-color: var(--color-primary-border);
  box-shadow: inset 0 0 0 1px rgba(255, 90, 31, 0.08);
}
.platform-card__icon {
  display: grid;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 12px;
  background: var(--color-header-control-hover);
}
.platform-card__icon > * {
  font-size: 32px;
}
.platform-card__copy {
  display: grid;
  flex: 1;
  gap: 6px;
  justify-items: center;
}
.platform-card__copy strong {
  font-size: 18px;
}
.platform-card__copy small,
.platform-card__meta small {
  color: var(--text-muted);
  line-height: 1.4;
}
.platform-card__meta {
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin-top: auto;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: left;
}
.platform-card__meta small {
  color: inherit;
  font: inherit;
  text-align: right;
}
.community-callout {
  gap: 18px;
  margin-top: 28px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: rgba(88, 101, 242, 0.08);
}
.community-callout > img {
  width: 32px;
  height: 32px;
}
.community-callout__copy {
  flex: 1;
}
.community-callout p {
  margin-top: 3px;
  color: var(--text-secondary);
}
.community-callout > :last-child {
  margin-left: auto;
}
:deep(.discord-action .btn-content) {
  display: flex;
  align-items: center;
  gap: 8px;
}
:deep(.discord-action .btn-content svg) {
  width: 16px;
  height: 16px;
}
@media (max-width: 720px) {
  .install-page {
    width: min(100% - 24px, 1100px);
    padding-top: 28px;
  }
  .platform-grid {
    grid-template-columns: 1fr;
  }
  .platform-card {
    min-height: 190px;
  }
  .community-callout {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .community-callout > :last-child {
    width: 100%;
    margin-left: 0;
  }
}
@media (max-width: 480px) {
  .install-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }
  .platform-card {
    min-height: 180px;
  }
  .platform-card__meta {
    align-items: flex-start;
  }
  h1 {
    align-items: flex-end;
    flex-wrap: wrap;
  }
}
</style>
