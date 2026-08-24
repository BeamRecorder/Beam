<script setup lang="ts">
import { ArrowRight, Search } from '@lucide/vue';
import MiniSearch from 'minisearch';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import Dialog from '../../../../src/components/ui/dialog/Dialog.vue';
import KeyboardChip from '../../../../src/components/ui/Kbd/KeyboardChip.vue';
import {
  enabledDocsLocales,
  getDocsCatalogs,
  getDocsSearchEntries,
  type DocsLocale,
  type DocsSearchEntry,
} from '../content/docs-routes';

const { page } = useData();
const isOpen = ref(false);
const query = ref('');
const input = ref<HTMLInputElement | null>(null);
const searchIndexes = new Map<DocsLocale, MiniSearch<DocsSearchEntry>>();

const locale = computed<DocsLocale>(() => {
  const prefix = page.value.relativePath.split('/')[0];
  return enabledDocsLocales.includes(prefix as DocsLocale) ? (prefix as DocsLocale) : 'en';
});

const normalizeTerm = (value: string) =>
  value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();

const getSearchIndex = (docsLocale: DocsLocale) => {
  const cached = searchIndexes.get(docsLocale);
  if (cached) return cached;
  const index = new MiniSearch<DocsSearchEntry>({
    idField: 'path',
    fields: ['title', 'description', 'text'],
    storeFields: ['title', 'description', 'path'],
    processTerm: normalizeTerm,
    searchOptions: {
      boost: { title: 5, description: 2 },
      combineWith: 'AND',
      prefix: true,
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
      boostDocument: (_documentId, _term, fields) => {
        const pathDepth = String(fields?.path).split('/').filter(Boolean).length;
        return pathDepth === (docsLocale === 'en' ? 1 : 2) ? 2 : 1;
      },
    },
  });
  index.addAll(getDocsSearchEntries(docsLocale));
  searchIndexes.set(docsLocale, index);
  return index;
};

const results = computed(() => {
  const value = query.value.trim();
  if (!value) return [];
  return getSearchIndex(locale.value)
    .search(value)
    .slice(0, 10)
    .map((result) => ({
      title: String(result.title),
      description: String(result.description),
      path: String(result.path),
    }));
});

const featured = computed(() => {
  const prefix = locale.value === 'en' ? '' : `${locale.value}/`;
  return getDocsCatalogs(locale.value).home.categories.map((category) => ({
    ...category,
    href: withBase(`/${prefix}${category.link.replace(/^\//, '')}`),
  }));
});

const open = async () => {
  isOpen.value = true;
  await nextTick();
  input.value?.focus();
};

const close = () => {
  isOpen.value = false;
  query.value = '';
};

const handleShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    void open();
  }
};

onMounted(() => window.addEventListener('keydown', handleShortcut));
onUnmounted(() => window.removeEventListener('keydown', handleShortcut));
</script>

<template>
  <button class="docs-search-trigger" type="button" aria-label="Search Beam documentation" @click="open">
    <Search aria-hidden="true" />
    <span>Search documentation</span>
    <ClientOnly>
      <KeyboardChip shortcut="CommandOrControl+K" />
      <template #fallback><KeyboardChip :keys="['Ctrl', 'K']" /></template>
    </ClientOnly>
  </button>

  <Dialog :is-open="isOpen" title="Search Beam Docs" size="md" @close="close">
    <div class="docs-search-field">
      <Search aria-hidden="true" />
      <input
        ref="input"
        v-model="query"
        type="search"
        autocomplete="off"
        placeholder="Search Recorder, Video Editor, export…"
        aria-label="Search all Beam documentation"
      />
    </div>

    <section v-if="!query.trim()" class="docs-search-section" aria-label="Main documentation sections">
      <p>Start here</p>
      <a v-for="item in featured" :key="item.link" class="docs-search-result" :href="item.href" @click="close">
        <span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.details }}</small>
        </span>
        <ArrowRight aria-hidden="true" />
      </a>
    </section>

    <section v-else-if="results.length" class="docs-search-section" aria-live="polite">
      <p>{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</p>
      <a
        v-for="result in results"
        :key="result.path"
        class="docs-search-result"
        :href="withBase(result.path)"
        @click="close"
      >
        <span>
          <strong>{{ result.title }}</strong>
          <small>{{ result.description }}</small>
        </span>
        <ArrowRight aria-hidden="true" />
      </a>
    </section>

    <p v-else class="docs-search-empty" aria-live="polite">No documentation found for “{{ query }}”.</p>
  </Dialog>
</template>

<style scoped>
.docs-search-trigger {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 40;
  display: flex;
  width: min(272px, 26vw);
  height: 40px;
  padding: 0 10px 0 13px;
  transform: translateX(-50%);
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-header-control);
  color: var(--text-muted);
  cursor: pointer;
  font: 600 13px/1 var(--font-sans);
}

.docs-search-trigger:hover {
  border-color: var(--color-primary-border);
  background: var(--color-header-control-hover);
  color: var(--text-primary);
}

.docs-search-trigger > svg,
.docs-search-field > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.docs-search-trigger > span {
  overflow: hidden;
  flex: 1;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-search-field {
  display: flex;
  height: 48px;
  padding: 0 14px;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-app);
  color: var(--text-muted);
}

.docs-search-field:focus-within {
  border-color: var(--color-primary-border);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.docs-search-field input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: 600 15px/1.4 var(--font-sans);
}

.docs-search-field input::placeholder {
  color: var(--text-muted);
}

.docs-search-section {
  display: grid;
  margin-top: 20px;
  gap: 6px;
}

.docs-search-section > p {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.docs-search-result {
  display: flex;
  min-width: 0;
  padding: 12px 13px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  text-decoration: none;
}

.docs-search-result:hover,
.docs-search-result:focus-visible {
  border-color: var(--color-primary-border);
  background: var(--color-primary-light);
}

.docs-search-result > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.docs-search-result strong {
  font-size: 14px;
}

.docs-search-result small {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-search-result > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--color-primary);
}

.docs-search-empty {
  margin: 20px 0 4px;
  padding: 20px;
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 959px) {
  .docs-search-trigger {
    position: static;
    width: 40px;
    padding: 0;
    transform: none;
    justify-content: center;
  }

  .docs-search-trigger > span,
  .docs-search-trigger :deep(.keyboard-chip) {
    display: none;
  }
}

@media (max-width: 639px) {
  .docs-search-result small {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
</style>
