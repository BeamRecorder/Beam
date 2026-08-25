<script setup lang="ts">
import { BookOpen, ExternalLink } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Accordion from '~/ui/accordion/Accordion.vue';
import discordIconUrl from '../../../public/discord_svg.svg';
import githubIconUrl from '../../../public/github.svg';
import beamIconUrl from '../assets/beam-icon-72.webp';
import { normalizeWebsiteLocale } from '@website/i18n';
import { getFaqCatalog, hasFaqCatalog, loadFaqCatalog } from '@website/seo/faq-content';
import { createFaqJsonLd } from '@website/seo/json-ld';
import { REPOSITORY_URL } from '@website/seo/site';
import { usePageSeo } from '@website/seo/use-page-seo';
import WebsiteShaderPanel from '@website/components/WebsiteShaderPanel.vue';

const { locale, t } = useI18n();
const selectedLocale = computed(() => normalizeWebsiteLocale(locale.value) ?? 'en');
const catalog = shallowRef(getFaqCatalog(selectedLocale.value));
const faqItems = computed(() => catalog.value.items);
const openItems = ref(faqItems.value.map(() => false));
const categoryOrder = ['application', 'creation', 'comparisons', 'community'] as const;
const faqGroups = computed(() =>
  categoryOrder.map((category) => ({
    category,
    label: catalog.value.categories[category],
    entries: faqItems.value.map((item, index) => ({ item, index })).filter(({ item }) => item.category === category),
  })),
);

const openHashItem = async () => {
  if (typeof window === 'undefined' || !window.location.hash) return;

  let itemId = '';
  try {
    itemId = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }

  const itemIndex = faqItems.value.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) return;

  openItems.value = faqItems.value.map((_, index) => index === itemIndex);
  await nextTick();
  document.getElementById(itemId)?.scrollIntoView({ behavior: 'auto', block: 'start' });
};

let catalogRequest = 0;
watch(
  selectedLocale,
  async (nextLocale) => {
    if (hasFaqCatalog(nextLocale)) {
      const nextCatalog = getFaqCatalog(nextLocale);
      if (catalog.value !== nextCatalog) {
        catalog.value = nextCatalog;
        openItems.value = nextCatalog.items.map(() => false);
        await openHashItem();
      }
      return;
    }

    const requestId = ++catalogRequest;
    const nextCatalog = await loadFaqCatalog(nextLocale);
    if (requestId !== catalogRequest) return;
    catalog.value = nextCatalog;
    openItems.value = nextCatalog.items.map(() => false);
    await openHashItem();
  },
  { immediate: true },
);

onMounted(() => {
  void openHashItem();
  window.addEventListener('hashchange', openHashItem);
});

onBeforeUnmount(() => window.removeEventListener('hashchange', openHashItem));

usePageSeo({
  path: '/faq',
  title: computed(() => catalog.value.meta.title),
  description: computed(() => catalog.value.meta.description),
  jsonLd: computed(() => [createFaqJsonLd(faqItems.value)]),
});
</script>

<template>
  <main class="site-shell content-page">
    <header class="page-intro">
      <h1>{{ catalog.intro.title }}</h1>
      <p class="lede">{{ catalog.intro.lede }}</p>
    </header>

    <section class="faq-list" :aria-label="catalog.intro.ariaLabel">
      <section v-for="group in faqGroups" :key="group.category" class="faq-group">
        <h2>{{ group.label }}</h2>
        <div class="faq-group__items">
          <Accordion
            v-for="{ item, index } in group.entries"
            :id="item.id"
            :key="item.question"
            v-model="openItems[index]"
            class="faq-item"
          >
            <template #title
              ><span class="faq-question">{{ item.question }}</span></template
            >
            <p class="faq-answer">{{ item.answer }}</p>
            <a v-if="item.sourceUrl" class="faq-source" :href="item.sourceUrl" target="_blank" rel="noreferrer">
              {{ item.sourceLabel }} <ExternalLink aria-hidden="true" />
            </a>
          </Accordion>
        </div>
      </section>
    </section>

    <WebsiteShaderPanel as="aside" class="page-callout">
      <div class="page-callout__copy">
        <img class="page-callout__logo" :src="beamIconUrl" alt="" />
        <div>
          <h2>{{ catalog.callout.title }}</h2>
        </div>
      </div>
      <div class="hero-actions">
        <a class="secondary-action" href="/docs/">
          <BookOpen aria-hidden="true" />
          {{ catalog.callout.docs }}
        </a>
        <a class="secondary-action" :href="REPOSITORY_URL" target="_blank" rel="noreferrer">
          <img class="github-icon" :src="githubIconUrl" alt="" />
          {{ catalog.callout.github }}
        </a>
        <a class="secondary-action" href="https://discord.gg/6Q6v2xUCB" target="_blank" rel="noreferrer">
          <img class="discord-icon" :src="discordIconUrl" alt="" />
          {{ t('Website.home.joinDiscord') }}
        </a>
      </div>
    </WebsiteShaderPanel>
  </main>
</template>

<style scoped>
.faq-list {
  display: grid;
  gap: 48px;
  max-width: 900px;
}

.faq-group h2 {
  margin-bottom: 16px;
  font-size: clamp(25px, 3vw, 34px);
}

.faq-group__items {
  display: grid;
  gap: 12px;
}

.faq-item {
  scroll-margin-top: 88px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.faq-question {
  color: var(--text-primary);
  font-family: var(--font-headline);
  font-size: 20px;
  font-weight: 700;
}

.faq-answer {
  max-width: 760px;
  padding: 4px 14px 14px;
  color: var(--text-secondary);
  font-size: 17px;
  line-height: 1.65;
}

.faq-source {
  display: inline-flex;
  margin: 0 14px 14px;
  align-items: center;
  gap: 7px;
  color: var(--color-primary-hover);
  font-size: 14px;
  font-weight: 650;
  text-underline-offset: 3px;
}

.faq-source svg {
  width: 15px;
  height: 15px;
}

.page-callout {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  margin-top: 64px;
  padding: 32px;
}

.page-callout h2 {
  margin-top: 8px;
  color: var(--shader-panel-text);
  font-size: clamp(28px, 4vw, 44px);
}

.page-callout__copy {
  display: flex;
  align-items: center;
  gap: 18px;
}

.page-callout__logo {
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.page-callout .hero-actions {
  justify-content: flex-end;
  margin-top: 0;
}

.page-callout .secondary-action img {
  width: 19px;
  height: 19px;
  filter: var(--brand-icon-filter);
  opacity: 0.86;
}

@media (max-width: 720px) {
  .page-callout {
    align-items: stretch;
    flex-direction: column;
  }

  .page-callout .hero-actions {
    justify-content: flex-start;
  }
}
</style>
