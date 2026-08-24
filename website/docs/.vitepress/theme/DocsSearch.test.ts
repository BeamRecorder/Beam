import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  page: { value: { relativePath: 'index.md' } },
  withBase: vi.fn((path: string) => `/docs${path}`),
}));

vi.mock('vitepress', () => ({
  useData: () => ({ page: mocked.page }),
  withBase: mocked.withBase,
}));

import DocsSearch from './DocsSearch.vue';

const ClientOnlyStub = {
  template: '<span class="client-only"><slot /></span>',
};

const mountedWrappers: VueWrapper[] = [];

const mountSearch = () => {
  const wrapper = mount(DocsSearch, {
    attachTo: document.body,
    global: {
      stubs: {
        ClientOnly: ClientOnlyStub,
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const openSearch = async (wrapper: VueWrapper) => {
  await wrapper.get('.docs-search-trigger').trigger('click');
  await flushPromises();
  await nextTick();
};

const resultTitles = () =>
  [...document.body.querySelectorAll<HTMLElement>('.docs-search-result strong')].map((element) =>
    element.textContent?.trim(),
  );

const searchInput = () => document.body.querySelector<HTMLInputElement>('.docs-search-field input');

const setSearchQuery = async (value: string) => {
  const input = searchInput();
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
};

beforeEach(() => {
  mocked.page.value.relativePath = 'index.md';
  mocked.withBase.mockClear();
});

afterEach(() => {
  for (const wrapper of mountedWrappers) wrapper.unmount();
  mountedWrappers.length = 0;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  vi.clearAllMocks();
});

describe('DocsSearch', () => {
  it('starts with the Recorder and Video editor sections', async () => {
    const wrapper = mountSearch();
    await openSearch(wrapper);

    expect(document.body.querySelector('.docs-search-section')?.getAttribute('aria-label')).toBe(
      'Main documentation sections',
    );
    expect(resultTitles()).toEqual(['Recorder app', 'Video editor']);
    expect(
      [...document.body.querySelectorAll<HTMLAnchorElement>('.docs-search-result')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/docs/recorder/', '/docs/editor/']);
  });

  it('finds Recorder pages for an exact search', async () => {
    const wrapper = mountSearch();
    await openSearch(wrapper);

    await setSearchQuery('recorder');

    expect(resultTitles().length).toBeGreaterThan(0);
    expect(resultTitles().some((title) => title?.startsWith('Recorder'))).toBe(true);
    expect(document.body.querySelector('.docs-search-empty')).toBeNull();
  });

  it.each(['recordre', 'recordere'])('supports the “%s” typo through fuzzy matching', async (typo) => {
    const wrapper = mountSearch();
    await openSearch(wrapper);

    await setSearchQuery(typo);

    expect(resultTitles().some((title) => title?.startsWith('Recorder'))).toBe(true);
  });

  it('ranks a title match ahead of pages that only mention the term in content', async () => {
    const wrapper = mountSearch();
    await openSearch(wrapper);

    await setSearchQuery('teleprompter');

    const titles = resultTitles();
    expect(titles[0]).toBe('Teleprompter');
    expect(titles.indexOf('Recorder preferences')).toBeGreaterThan(0);
  });

  it('shows an explicit empty state when no page matches', async () => {
    const wrapper = mountSearch();
    await openSearch(wrapper);

    await setSearchQuery('zzzzzz-no-document');

    expect(document.body.querySelector('.docs-search-empty')?.textContent).toContain(
      'No documentation found for “zzzzzz-no-document”.',
    );
    expect(document.body.querySelector('.docs-search-section')).toBeNull();
  });

  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('opens and focuses the dialog with the %s+K shortcut', async (_modifier, modifier) => {
    mountSearch();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...modifier }));
    await flushPromises();
    await nextTick();

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(searchInput());
  });
});
