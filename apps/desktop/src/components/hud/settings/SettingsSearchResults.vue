<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronRight, Search } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { SETTINGS_CATEGORIES } from './settings-catalog';
import type { SettingsSearchEntry } from './settings-types';

const props = defineProps<{ query: string; results: SettingsSearchEntry[] }>();
const emit = defineEmits<{ select: [SettingsSearchEntry] }>();
const { t } = useTranslate('HudPreferences');
const limit = ref(40);
watch(
  () => props.query,
  () => {
    limit.value = 40;
  },
);
const visibleResults = computed(() => props.results.slice(0, limit.value));
const categoryLabel = (entry: SettingsSearchEntry) => t(SETTINGS_CATEGORIES.find(({ id }) => id === entry.view)!.label);
</script>

<template>
  <section class="search-results" :aria-label="t('searchResults')">
    <header class="results-header">
      <h1>{{ t('searchResults') }}</h1>
      <p role="status" aria-live="polite">
        {{ t('resultCount', { count: results.length }) }}
      </p>
    </header>
    <div v-if="!results.length" class="search-empty">
      <Search :size="28" aria-hidden="true" />
      <p>{{ t('noSearchResults') }}</p>
      <span>{{ t('searchHint') }}</span>
    </div>
    <div v-else class="results-list">
      <Button
        v-for="result in visibleResults"
        :key="result.id"
        variant="ghost"
        block
        wrap
        :data-search-result="result.id"
        :style="{
          height: 'auto',
          padding: '16px',
          background: 'var(--color-bg-element)',
          textAlign: 'left',
          justifyContent: 'flex-start',
        }"
        @click="emit('select', result)"
      >
        <span class="result-row">
          <span class="result-copy"
            ><span class="result-category">{{ categoryLabel(result) }}</span
            ><span class="result-title">{{ result.title }}</span
            ><span class="result-description">{{ result.description }}</span></span
          >
          <ChevronRight :size="16" aria-hidden="true" />
        </span>
      </Button>
      <Button v-if="results.length > limit" variant="secondary" size="sm" @click="limit += 40">{{
        t('showMoreResults')
      }}</Button>
    </div>
  </section>
</template>

<style scoped>
.search-results {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px;
}
.results-header {
  margin-bottom: 24px;
}
.results-header h1 {
  font-size: 24px;
  font-weight: var(--weight-display);
  letter-spacing: -0.5px;
}
.results-header p {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-lg);
}
.results-list {
  display: grid;
  gap: 10px;
}
.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.result-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.result-title {
  color: var(--text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--weight-display);
}
.result-description,
.result-category {
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-body);
  line-height: 1.5;
}
.result-category {
  font-size: var(--font-size-sm);
}
.search-empty {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 12px;
  padding: 56px 16px;
  color: var(--text-secondary);
  font-size: var(--font-size-lg);
}
.search-empty p {
  color: var(--text-primary);
}
.search-empty span {
  font-size: var(--font-size-body);
}
@media (max-width: 700px) {
  .search-results {
    padding: 20px;
  }
}
</style>
