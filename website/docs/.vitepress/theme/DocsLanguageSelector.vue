<script setup lang="ts">
import { Check, Languages } from '@lucide/vue';
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import Button from '../../../../src/components/ui/button/Button.vue';
import Popover from '../../../../src/components/ui/popover/Popover.vue';
import { enabledDocsLocales, getDocsCatalogs, type DocsLocale } from '../content/docs-routes';

const { page } = useData();

const currentLocale = computed<DocsLocale>(() => {
  const prefix = page.value.relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as DocsLocale) ? (prefix as DocsLocale) : 'en';
});

const pagePath = computed(() => {
  const withoutExtension = page.value.relativePath.replace(/\.md$/, '');
  const withoutLocale = currentLocale.value === 'en' ? withoutExtension : withoutExtension.replace(/^[^/]+\//, '');
  return withoutLocale === 'index' ? '' : withoutLocale.replace(/\/index$/, '');
});

const localeOptions = computed(() =>
  enabledDocsLocales.map((locale) => {
    const prefix = locale === 'en' ? '' : `${locale}/`;
    const suffix = pagePath.value ? `${pagePath.value}` : '';
    return {
      locale,
      label: getDocsCatalogs(locale).common.label,
      href: withBase(`/${prefix}${suffix}`),
    };
  }),
);

const currentLabel = computed(() => getDocsCatalogs(currentLocale.value).common.label);
</script>

<template>
  <Popover v-if="localeOptions.length > 1" align="right" :match-trigger-width="false">
    <template #trigger>
      <Button
        class="docs-language-trigger"
        variant="ghost"
        size="md"
        icon-only
        :icon="Languages"
        :tooltip="currentLabel"
        tooltip-position="bottom"
        :aria-label="`Language: ${currentLabel}`"
        aria-haspopup="listbox"
      />
    </template>

    <div class="docs-language-menu" role="listbox" :aria-label="`Language: ${currentLabel}`">
      <a
        v-for="option in localeOptions"
        :key="option.locale"
        :href="option.href"
        role="option"
        :aria-selected="option.locale === currentLocale"
        :lang="getDocsCatalogs(option.locale).common.locale"
      >
        <span>{{ option.label }}</span>
        <Check v-if="option.locale === currentLocale" aria-hidden="true" />
      </a>
    </div>
  </Popover>
</template>

<style scoped>
:deep(.docs-language-trigger) {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  background: var(--color-header-control);
  color: var(--text-secondary);
}

:deep(.docs-language-trigger:hover) {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-language-menu {
  display: grid;
  width: min(280px, calc(100vw - 24px));
  max-height: min(460px, calc(100vh - 32px));
  padding: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  overflow-y: auto;
}

.docs-language-menu a {
  display: flex;
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
}

.docs-language-menu a:hover,
.docs-language-menu a[aria-selected='true'] {
  background: var(--color-primary-light);
  color: var(--text-primary);
}

.docs-language-menu svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--color-primary);
}

@media (max-width: 767px) {
  :deep(.docs-language-trigger) {
    border-color: transparent;
    background: transparent;
  }
}
</style>
