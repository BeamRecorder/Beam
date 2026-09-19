import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import { createI18n } from 'vue-i18n';
import KeyboardChip from '../../../../src/components/ui/Kbd/KeyboardChip.vue';
import englishUiMessages from '../../../../src/i18n/en/core.json';
import DocsFooter from './DocsFooter.vue';
import DocsNavActions from './DocsNavActions.vue';
import DocsProductCard from './DocsProductCard.vue';
import DocsScreenshot from './DocsScreenshot.vue';
import DocsRouteTransition from './DocsRouteTransition.vue';
import './theme.css';

const createDocsUiI18n = () =>
  createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en: englishUiMessages },
  });

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-title-after': () =>
        h('span', { class: 'docs-brand' }, [h('span', 'Beam'), h('span', { class: 'docs-brand__suffix' }, 'Docs')]),
      'nav-bar-content-after': () => h(DocsNavActions),
      'layout-bottom': () => [h(DocsFooter), h(DocsRouteTransition)],
    }),
  enhanceApp({ app }) {
    app.use(createDocsUiI18n());
    app.component('DocsScreenshot', DocsScreenshot);
    app.component('DocsProductCard', DocsProductCard);
    app.component('KeyboardChip', KeyboardChip);
  },
} satisfies Theme;
