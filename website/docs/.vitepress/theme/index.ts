import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import KeyboardChip from '../../../../src/components/ui/Kbd/KeyboardChip.vue';
import DocsNavActions from './DocsNavActions.vue';
import DocsProductCard from './DocsProductCard.vue';
import DocsScreenshot from './DocsScreenshot.vue';
import DocsRouteTransition from './DocsRouteTransition.vue';
import './theme.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'nav-bar-title-after': () =>
        h('span', { class: 'docs-brand' }, [h('span', 'Beam'), h('span', { class: 'docs-brand__suffix' }, 'Docs')]),
      'nav-bar-content-after': () => h(DocsNavActions),
      'layout-bottom': () => h(DocsRouteTransition),
    }),
  enhanceApp({ app }) {
    app.component('DocsScreenshot', DocsScreenshot);
    app.component('DocsProductCard', DocsProductCard);
    app.component('KeyboardChip', KeyboardChip);
  },
} satisfies Theme;
