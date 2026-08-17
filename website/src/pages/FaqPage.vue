<script setup lang="ts">
import { BookOpen, ExternalLink } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Accordion from '~/ui/accordion/Accordion.vue';
import discordIconUrl from '../../../public/discord_svg.svg';
import githubIconUrl from '../../../public/github.svg';
import { demoMedia } from '@website/demo/website-demo-fixture';
import { normalizeWebsiteLocale } from '@website/i18n';
import { getFaqCatalog } from '@website/seo/faq-content';
import { createFaqJsonLd } from '@website/seo/json-ld';
import { REPOSITORY_URL } from '@website/seo/site';
import { usePageSeo } from '@website/seo/use-page-seo';

const { locale, t } = useI18n();
const selectedLocale = computed(() => normalizeWebsiteLocale(locale.value) ?? 'en');
const catalog = computed(() => getFaqCatalog(selectedLocale.value));
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

usePageSeo({
  path: '/faq',
  title: computed(() => catalog.value.meta.title),
  description: computed(() => catalog.value.meta.description),
  jsonLd: [createFaqJsonLd(faqItems.value)],
});
</script>

<template>
  <main class="site-shell content-page">
    <header class="page-intro">
      <p class="eyebrow">{{ catalog.intro.eyebrow }}</p>
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

    <aside class="page-callout">
      <div class="page-callout__copy">
        <img class="page-callout__logo" :src="demoMedia.iconUrl" alt="" />
        <div>
          <p class="eyebrow">{{ catalog.callout.eyebrow }}</p>
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
    </aside>
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
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-element);
}

.page-callout h2 {
  margin-top: 8px;
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
