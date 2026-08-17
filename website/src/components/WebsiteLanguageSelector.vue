<script setup lang="ts">
import { Check, Globe2 } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { WEBSITE_LOCALES, type WebsiteLocale } from '@website/i18n';

const { locale } = useI18n();

const languageNames: Record<WebsiteLocale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  ru: 'Русский',
  bg: 'Български',
  'zh-CN': '简体中文',
  ko: '한국어',
  'pt-BR': 'Português (Brasil)',
  ja: '日本語',
  it: 'Italiano',
  pl: 'Polski',
  'zh-TW': '繁體中文',
  hi: 'हिन्दी',
  vi: 'Tiếng Việt',
};

const selectedLocale = computed(() => locale.value as WebsiteLocale);
const selectorLabel = computed(() => `Language: ${languageNames[selectedLocale.value]}`);

const selectLocale = (nextLocale: WebsiteLocale, close: () => void) => {
  locale.value = nextLocale;
  document.documentElement.lang = nextLocale;
  localStorage.setItem('locale', nextLocale);
  close();
};
</script>

<template>
  <Popover align="right" :match-trigger-width="false">
    <template #trigger>
      <Button
        class="language-trigger"
        variant="ghost"
        size="md"
        icon-only
        :icon="Globe2"
        :tooltip="selectorLabel"
        tooltip-position="bottom"
        :aria-label="selectorLabel"
        aria-haspopup="listbox"
      />
    </template>

    <template #default="{ close }">
      <div class="language-menu" role="listbox" :aria-label="selectorLabel">
        <button
          v-for="language in WEBSITE_LOCALES"
          :key="language"
          type="button"
          role="option"
          :aria-selected="language === selectedLocale"
          @click="selectLocale(language, close)"
        >
          <span>{{ languageNames[language] }}</span>
          <Check v-if="language === selectedLocale" aria-hidden="true" />
        </button>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
:deep(.language-trigger) {
  width: 42px;
  height: 42px;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  background: var(--color-header-control);
  color: var(--text-secondary);
}

:deep(.language-trigger:hover) {
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.language-menu {
  display: grid;
  width: min(280px, calc(100vw - 24px));
  max-height: min(460px, calc(100vh - 32px));
  padding: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  overflow-y: auto;
}

.language-menu button {
  display: flex;
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.language-menu button:hover,
.language-menu button[aria-selected='true'] {
  background: var(--color-primary-light);
  color: var(--text-primary);
}

.language-menu button svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--color-primary);
}
</style>
