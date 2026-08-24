import { createHead } from '@unhead/vue/client';
import { mount } from '@vue/test-utils';
import type { Question } from 'schema-dts';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebsiteI18n, type WebsiteLocale } from '../i18n';
import { faqItems, localizedFaqItems } from '../seo/faq-content';
import { createFaqJsonLd } from '../seo/json-ld';
import FaqPage from './FaqPage.vue';

const mountedWrappers: Array<{ unmount: () => void }> = [];
const initialUrl = window.location.href.split('#')[0];
let restoreScrollIntoView = () => {};

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.head.innerHTML = '';
  window.history.replaceState({}, '', initialUrl);
  restoreScrollIntoView();
  restoreScrollIntoView = () => {};
});

const mountFaq = (locale: WebsiteLocale = 'en', attachTo?: Element) => {
  const wrapper = mount(FaqPage, {
    ...(attachTo ? { attachTo } : {}),
    global: {
      plugins: [createWebsiteI18n(locale), createHead()],
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const setLocationHash = (hash: string) => {
  window.history.replaceState({}, '', `${initialUrl}#${hash}`);
};

const installScrollIntoViewSpy = () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scrollIntoView = vi.fn();

  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  restoreScrollIntoView = () => {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  };

  return scrollIntoView;
};

const faqCategories = ['application', 'creation', 'comparisons', 'community'] as const;
const categoryLabels: Partial<Record<WebsiteLocale, readonly string[]>> = {
  en: ['Beam application', 'Recording and editing', 'Comparisons', 'Community'],
  fr: ['Application Beam', 'Enregistrement et montage', 'Comparaisons', 'Communauté'],
};

const expectFaqGroups = (locale: WebsiteLocale, wrapper: ReturnType<typeof mountFaq>) => {
  const items = localizedFaqItems(locale);
  const groups = wrapper.findAll('.faq-group');

  expect(groups).toHaveLength(faqCategories.length);
  expect(groups.map((group) => group.get('h2').text())).toEqual(categoryLabels[locale]);

  const groupedIds = groups.flatMap((group) => group.findAll('.faq-item').map((item) => item.attributes('id')));
  expect(groupedIds).toHaveLength(items.length);
  expect(new Set(groupedIds).size).toBe(items.length);
  expect([...groupedIds].sort()).toEqual(items.map((item) => item.id).sort());

  faqCategories.forEach((category, index) => {
    const expectedItems = items.filter((item) => item.category === category);
    const actualItems = groups[index]?.findAll('.faq-item') ?? [];

    expect(actualItems.map((item) => item.attributes('id'))).toEqual(expectedItems.map((item) => item.id));
    for (const item of expectedItems) {
      expect(wrapper.findAll(`#${item.id}`)).toHaveLength(1);
      expect(groups[index]?.get(`#${item.id} .faq-question`).text()).toBe(item.question);
    }
  });
};

describe('FaqPage', () => {
  it('renders comparison-focused English page copy', () => {
    const wrapper = mountFaq();

    expect(wrapper.get('h1').text()).toBe('Everything you need to know about Beam.');
    expect(wrapper.text()).toContain('Factual answers about Beam, its features, and other screen recorders.');
    expect(wrapper.text()).toContain('Beam vs Screen Studio: which screen recorder should I choose?');
  });

  it.each(['en', 'fr'] as const)('renders every FAQ exactly once inside its %s category', (locale) => {
    expectFaqGroups(locale, mountFaq(locale));
  });

  it('renders every FAQ item with a stable anchor, answer, and official source link', () => {
    const wrapper = mountFaq();
    const items = localizedFaqItems('en');
    const accordions = wrapper.findAll('section.faq-item');
    const ids = accordions.map((accordion) => accordion.attributes('id'));

    expect(accordions).toHaveLength(items.length);
    expect(new Set(ids).size).toBe(items.length);

    for (const item of items) {
      const accordion = wrapper.get(`#${item.id}`);
      expect(accordion.get('button.accordion-trigger').text()).toContain(item.question);
      expect(accordion.text()).toContain(item.answer);

      if (!item.sourceUrl) continue;
      const source = accordion.get('a.faq-source');
      expect(source.attributes('href')).toBe(item.sourceUrl);
      expect(source.attributes('target')).toBe('_blank');
      expect(source.attributes('rel')).toBe('noreferrer');
      expect(source.text()).toContain(item.sourceLabel);
      expect(item.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('exposes comparison anchors for every named alternative', () => {
    const wrapper = mountFaq();
    const comparisonIds = [
      'beam-vs-screen-studio',
      'beam-vs-tella',
      'beam-vs-openscreen',
      'beam-vs-obs',
      'beam-vs-loom',
    ];

    for (const id of comparisonIds) {
      wrapper.get(`#${id}`);
      expect(wrapper.get(`#${id} .faq-question`).text()).toContain('Beam vs');
    }
  });

  it('uses accessible Accordion buttons and opens the selected answer', async () => {
    const wrapper = mountFaq();
    const first = wrapper.get(`#${faqItems[0].id}`);
    const trigger = first.get<HTMLButtonElement>('button.accordion-trigger');
    const contentId = trigger.attributes('aria-controls');

    expect(trigger.attributes('type')).toBe('button');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(contentId).toBeTruthy();
    expect(first.classes()).not.toContain('is-open');

    await trigger.trigger('click');
    await nextTick();
    await nextTick();

    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(first.classes()).toContain('is-open');
    expect(wrapper.get(`#${contentId} .faq-answer`).text()).toBe(faqItems[0].answer);
  });

  it('opens and scrolls to the accordion named by a valid initial hash', async () => {
    const target = faqItems.find((item) => item.id === 'beam-vs-screen-studio')!;
    setLocationHash(target.id);
    const scrollIntoView = installScrollIntoViewSpy();
    const wrapper = mountFaq('en', document.body);

    await nextTick();
    await nextTick();

    expect(wrapper.findAll('.faq-item.is-open').map((item) => item.attributes('id'))).toEqual([target.id]);
    expect(wrapper.get(`#${target.id} .accordion-trigger`).attributes('aria-expanded')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
  });

  it('closes the previous accordion and opens the new one on hashchange', async () => {
    const firstTarget = faqItems.find((item) => item.id === 'beam-vs-screen-studio')!;
    const secondTarget = faqItems.find((item) => item.id === 'beam-vs-loom')!;
    setLocationHash(firstTarget.id);
    installScrollIntoViewSpy();
    const wrapper = mountFaq('en', document.body);

    await nextTick();
    await nextTick();
    expect(wrapper.findAll('.faq-item.is-open').map((item) => item.attributes('id'))).toEqual([firstTarget.id]);

    setLocationHash(secondTarget.id);
    window.dispatchEvent(new Event('hashchange'));
    await nextTick();
    await nextTick();

    expect(wrapper.findAll('.faq-item.is-open').map((item) => item.attributes('id'))).toEqual([secondTarget.id]);
    expect(wrapper.get(`#${firstTarget.id} .accordion-trigger`).attributes('aria-expanded')).toBe('false');
    expect(wrapper.get(`#${secondTarget.id} .accordion-trigger`).attributes('aria-expanded')).toBe('true');
  });

  it.each([
    ['an unknown', 'does-not-exist'],
    ['a malformed', '%E0%A4%A'],
  ] as const)('ignores %s hash without opening an accordion or throwing', async (_label, hash) => {
    setLocationHash(hash);
    let wrapper: ReturnType<typeof mountFaq> | undefined;

    expect(() => {
      wrapper = mountFaq('en', document.body);
    }).not.toThrow();

    await nextTick();
    await nextTick();

    expect(wrapper).toBeDefined();
    expect(wrapper!.findAll('.faq-item.is-open')).toHaveLength(0);
    expect(wrapper!.findAll('button.accordion-trigger[aria-expanded="true"]')).toHaveLength(0);
  });

  it('renders the French catalogue through a French i18n instance', () => {
    const wrapper = mountFaq('fr');
    const items = localizedFaqItems('fr');

    expect(wrapper.get('h1').text()).toBe('Tout ce qu’il faut savoir sur Beam.');
    expect(wrapper.text()).toContain(
      'Des réponses factuelles sur Beam, ses fonctionnalités et les autres enregistreurs d’écran.',
    );
    expect(wrapper.text()).toContain('Beam vs Screen Studio : quel enregistreur d’écran choisir ?');
    expect(wrapper.text()).not.toContain('Everything you need to know about Beam.');

    expect(wrapper.findAll('section.faq-item')).toHaveLength(items.length);
    for (const item of items) {
      const accordion = wrapper.get(`#${item.id}`);
      expect(accordion.get('.faq-question').text()).toBe(item.question);
      expect(accordion.get('.faq-answer').text()).toBe(item.answer);
    }
  });

  it('renders the Beam callout with documentation, GitHub, and Discord actions', () => {
    const wrapper = mountFaq('fr');
    const callout = wrapper.get('.page-callout');
    const actions = callout.findAll('a.secondary-action');

    expect(callout.get('.page-callout__logo').attributes('src')).toBeTruthy();
    expect(actions).toHaveLength(3);
    expect(actions.map((action) => action.attributes('href'))).toEqual([
      '/docs/',
      'https://github.com/BeamRecorder/Beam',
      'https://discord.gg/6Q6v2xUCB',
    ]);
    expect(actions[0]?.find('svg').exists()).toBe(true);
    expect(actions[1]?.get('img.github-icon').attributes('src')).toBeTruthy();
    expect(actions[2]?.get('img.discord-icon').attributes('src')).toBeTruthy();
    expect(actions[2]?.text()).toContain('Rejoindre Discord');
  });

  it('keeps English and French visible answers aligned with their FAQ JSON-LD', () => {
    for (const items of [localizedFaqItems('en'), localizedFaqItems('fr')]) {
      const schema = createFaqJsonLd(items);
      const questions = schema.mainEntity as Question[];

      expect(questions).toHaveLength(items.length);
      expect(questions.map((item) => item.name)).toEqual(items.map((item) => item.question));
      expect(questions.map((item) => item.acceptedAnswer)).toEqual(
        items.map((item) => ({ '@type': 'Answer', text: item.answer })),
      );
    }
  });
});
