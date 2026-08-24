<script setup lang="ts">
import { ExternalLink, Menu } from '@lucide/vue';
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import Button from '../../../../src/components/ui/button/Button.vue';
import Popover from '../../../../src/components/ui/popover/Popover.vue';
import type { DocsSidebarItem } from '../content/docs-content-types';
import { enabledDocsLocales, getDocsCatalogs, type DocsLocale } from '../content/docs-routes';

const websiteUrl = 'https://beam.plinka.eu';
const githubUrl = 'https://github.com/BeamRecorder/Beam';
const discordUrl = 'https://discord.gg/6Q6v2xUCB';
const importantPaths = ['/getting-started', '/recorder/', '/editor/', '/export', '/platforms'] as const;

const { page } = useData();

const locale = computed<DocsLocale>(() => {
  const prefix = page.value.relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as DocsLocale) ? (prefix as DocsLocale) : 'en';
});

const common = computed(() => getDocsCatalogs(locale.value).common);

const flattenSidebar = (items: readonly DocsSidebarItem[]): DocsSidebarItem[] =>
  items.flatMap((item) => [item, ...(item.items ? flattenSidebar(item.items) : [])]);

const documentationLinks = computed(() => {
  const items = common.value.sidebar.flatMap((group) => flattenSidebar(group.items));
  const prefix = locale.value === 'en' ? '' : `${locale.value}/`;
  return importantPaths.flatMap((path) => {
    const item = items.find((candidate) => candidate.link === path);
    if (!item) return [];
    return [{ label: item.text, href: withBase(`/${prefix}${path.replace(/^\//, '')}`) }];
  });
});
</script>

<template>
  <div class="docs-mobile-menu-control">
    <Popover align="right" :match-trigger-width="false">
      <template #trigger="{ isOpen }">
        <Button
          class="docs-mobile-menu-trigger"
          variant="ghost"
          size="md"
          icon-only
          :icon="Menu"
          tooltip="Menu"
          tooltip-position="bottom"
          aria-label="Open navigation menu"
          :aria-expanded="isOpen"
        />
      </template>

      <template #default="{ close }">
        <nav class="docs-mobile-menu" aria-label="Mobile documentation navigation">
          <section>
            <p>Documentation</p>
            <a v-for="link in documentationLinks" :key="link.href" :href="link.href" @click="close">
              {{ link.label }}
            </a>
          </section>

          <section>
            <p>Beam</p>
            <a :href="websiteUrl" @click="close">
              {{ common.nav.website }}
              <ExternalLink aria-hidden="true" />
            </a>
            <a :href="githubUrl" target="_blank" rel="noreferrer" @click="close">
              GitHub
              <ExternalLink aria-hidden="true" />
            </a>
            <a :href="discordUrl" target="_blank" rel="noreferrer" @click="close">
              Discord
              <ExternalLink aria-hidden="true" />
            </a>
          </section>
        </nav>
      </template>
    </Popover>
  </div>
</template>

<style scoped>
.docs-mobile-menu-control {
  display: none;
}

:deep(.docs-mobile-menu-trigger) {
  width: 40px;
  height: 40px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--text-secondary);
}

:deep(.docs-mobile-menu-trigger:hover) {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-mobile-menu {
  display: grid;
  width: min(320px, calc(100vw - 16px));
  padding: 8px;
  gap: 8px;
}

.docs-mobile-menu section {
  display: grid;
  gap: 2px;
}

.docs-mobile-menu section + section {
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.docs-mobile-menu p {
  margin: 0;
  padding: 7px 10px 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.docs-mobile-menu a {
  display: flex;
  min-height: 42px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 620;
  text-decoration: none;
}

.docs-mobile-menu a:hover,
.docs-mobile-menu a:focus-visible {
  background: var(--color-primary-light);
  color: var(--text-primary);
}

.docs-mobile-menu svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .docs-mobile-menu-control {
    display: flex;
  }
}
</style>
