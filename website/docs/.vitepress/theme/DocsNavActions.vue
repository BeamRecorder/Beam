<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ExternalLink, Search, Star } from '@lucide/vue';
import KeyboardChip from '../../../../src/components/ui/Kbd/KeyboardChip.vue';
import discordIconUrl from '../../../../public/discord_svg.svg';
import githubIconUrl from '../../../../public/github.svg';
import DocsThemeToggle from './DocsThemeToggle.vue';
import DocsLanguageSelector from './DocsLanguageSelector.vue';

const githubUrl = 'https://github.com/ExtraBinoss/Beam';
const discordUrl = 'https://discord.gg/6Q6v2xUCB';
const websiteUrl = 'https://beam.plinka.eu';
const stars = ref<number | null>(null);

const formattedStars = computed(() =>
  stars.value === null ? '…' : new Intl.NumberFormat('en', { notation: 'compact' }).format(stars.value),
);

const openSearch = () => {
  document.querySelector<HTMLButtonElement>('.VPNavBarSearch .DocSearch-Button')?.click();
};

onMounted(async () => {
  try {
    const response = await fetch('https://api.github.com/repos/ExtraBinoss/Beam', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return;
    const repository = (await response.json()) as { stargazers_count?: unknown };
    if (typeof repository.stargazers_count === 'number') stars.value = repository.stargazers_count;
  } catch {
    // The repository link remains usable when the public API is unavailable.
  }
});
</script>

<template>
  <button class="docs-search-trigger" type="button" aria-label="Search Beam documentation" @click="openSearch">
    <Search aria-hidden="true" />
    <span>Search documentation</span>
    <ClientOnly>
      <KeyboardChip shortcut="CommandOrControl+K" />
      <template #fallback><KeyboardChip :keys="['Ctrl', 'K']" /></template>
    </ClientOnly>
  </button>

  <div class="docs-nav-actions" aria-label="Beam links and appearance">
    <a class="docs-nav-link website-link" :href="websiteUrl">
      <span>Beam website</span>
      <ExternalLink aria-hidden="true" />
    </a>
    <a class="docs-nav-link github-link" :href="githubUrl" target="_blank" rel="noreferrer">
      <img :src="githubIconUrl" alt="" />
      <span class="action-label">GitHub</span>
      <strong aria-label="GitHub stars" aria-live="polite">{{ formattedStars }}</strong>
      <Star aria-hidden="true" />
    </a>
    <a class="docs-nav-link discord-link" :href="discordUrl" target="_blank" rel="noreferrer">
      <img :src="discordIconUrl" alt="" />
      <span class="action-label">Discord</span>
    </a>
    <span class="actions-divider" aria-hidden="true" />
    <ClientOnly>
      <DocsLanguageSelector />
      <template #fallback><span class="language-placeholder" aria-hidden="true" /></template>
    </ClientOnly>
    <DocsThemeToggle />
  </div>
</template>

<style scoped>
.docs-search-trigger,
.docs-nav-actions,
.docs-nav-link {
  display: flex;
  align-items: center;
}

.docs-search-trigger {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 40;
  gap: 10px;
  width: min(320px, 28vw);
  height: 40px;
  padding: 0 10px 0 13px;
  transform: translateX(-50%);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-header-control);
  color: var(--text-muted);
  cursor: pointer;
  font: 600 13px/1 var(--font-sans);
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.docs-search-trigger:hover {
  border-color: var(--color-primary-border);
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-search-trigger > svg {
  width: 16px;
  height: 16px;
}

.docs-search-trigger > span {
  overflow: hidden;
  flex: 1;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-nav-actions {
  gap: 4px;
  margin-left: 8px;
}

.language-placeholder {
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

.github-link strong {
  min-width: 18px;
  padding-left: 8px;
  border-left: 1px solid var(--color-border);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.github-link svg {
  width: 13px;
  color: var(--color-primary);
}

.actions-divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--color-border);
}

@media (max-width: 1279px) {
  .website-link {
    display: none;
  }

  .docs-search-trigger {
    width: min(280px, 26vw);
  }
}

@media (max-width: 1080px) {
  .action-label {
    display: none;
  }

  .docs-nav-link {
    padding-inline: 9px;
  }
}

@media (max-width: 959px) {
  .docs-search-trigger,
  .docs-nav-link,
  .actions-divider {
    display: none;
  }

  .docs-nav-actions {
    display: flex;
    margin-left: 4px;
  }
}
</style>
