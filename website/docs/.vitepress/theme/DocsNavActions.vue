<script setup lang="ts">
import { ExternalLink } from '@lucide/vue';
import discordIconUrl from '../../../../public/discord_svg.svg';
import githubIconUrl from '../../../../public/github.svg';
import DocsThemeToggle from './DocsThemeToggle.vue';
import DocsLanguageSelector from './DocsLanguageSelector.vue';
import DocsMobileMenu from './DocsMobileMenu.vue';
import DocsSearch from './DocsSearch.vue';

const githubUrl = 'https://github.com/BeamRecorder/Beam';
const discordUrl = 'https://discord.gg/6Q6v2xUCB';
const websiteUrl = 'https://beam.plinka.eu';
</script>

<template>
  <DocsSearch />

  <div class="docs-nav-actions" aria-label="Beam links and appearance">
    <a class="docs-nav-link website-link" :href="websiteUrl">
      <span>Beam website</span>
      <ExternalLink aria-hidden="true" />
    </a>
    <span class="actions-divider" aria-hidden="true" />
    <a
      class="docs-nav-link community-link github-link"
      :href="githubUrl"
      target="_blank"
      rel="noreferrer"
      aria-label="GitHub"
    >
      <img :src="githubIconUrl" alt="" />
    </a>
    <a
      class="docs-nav-link community-link discord-link"
      :href="discordUrl"
      target="_blank"
      rel="noreferrer"
      aria-label="Discord"
    >
      <img :src="discordIconUrl" alt="" />
    </a>
    <ClientOnly>
      <DocsLanguageSelector />
      <template #fallback><span class="language-placeholder" aria-hidden="true" /></template>
    </ClientOnly>
    <span class="docs-theme-control"><DocsThemeToggle /></span>
    <ClientOnly>
      <DocsMobileMenu />
      <template #fallback><span class="mobile-menu-placeholder" aria-hidden="true" /></template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.docs-nav-actions,
.docs-nav-link {
  display: flex;
  align-items: center;
}

.docs-nav-actions {
  gap: 4px;
  margin-left: 8px;
}

.language-placeholder {
  width: 40px;
  height: 40px;
}

.mobile-menu-placeholder {
  display: none;
  width: 40px;
  height: 40px;
}

.docs-nav-link {
  gap: 7px;
  min-height: 40px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  transition:
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.docs-nav-link:hover {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-nav-link:active {
  transform: translateY(1px);
}

.docs-nav-link img,
.docs-nav-link svg {
  width: 16px;
  height: 16px;
}

.docs-nav-link img {
  filter: var(--brand-icon-filter);
  opacity: 0.82;
}

.community-link {
  width: 40px;
  padding: 0;
  justify-content: center;
}

.actions-divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--color-border);
}

@media (max-width: 959px) {
  .docs-nav-link,
  .actions-divider {
    display: none;
  }

  .docs-nav-actions {
    display: flex;
    margin-left: 4px;
  }
}

@media (min-width: 768px) and (max-width: 959px) {
  .docs-nav-link,
  .actions-divider {
    display: flex;
  }

  .website-link {
    padding-inline: 10px;
  }
}

@media (max-width: 767px) {
  .mobile-menu-placeholder {
    display: inline-block;
  }
}

@media (max-width: 767px) {
  .docs-theme-control {
    display: none;
  }
}
</style>
