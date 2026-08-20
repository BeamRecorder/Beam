import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { h, nextTick } from 'vue';
import Select from './Select.vue';

enableAutoUnmount(afterEach);

const options = [
  { value: 'one', label: 'First option', color: '#ff0000' },
  { value: 'two', label: 'A very long option label that changes the trigger size', thumbnail: '/preview.png' },
  { value: 'three', label: 'Loading option', loading: true },
];

const searchableOptions = [
  { value: 'noto', label: 'Noto Sans' },
  { value: 'cafe', label: 'Café Mono' },
  { value: 'serif', label: 'Serif Display' },
];

const visibleOptionLabels = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"] .option-label')).map(
    (option) => option.textContent,
  );

const searchInput = () => {
  const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Search options"]');
  if (!input) throw new Error('Searchable Select must render an options search input when opened.');
  return input;
};

const setSearch = async (value: string) => {
  const input = searchInput();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
};

let searchableWrapper: ReturnType<typeof mount> | undefined;
const mountSearchable = (props: {
  modelValue: string | number | null;
  options: typeof searchableOptions;
  variant: 'search';
  emptyLabel?: string;
  loading?: boolean;
}) => {
  searchableWrapper = mount(Select, { attachTo: document.body, props });
  return searchableWrapper;
};

describe('Select', () => {
  afterEach(() => {
    searchableWrapper?.unmount();
    searchableWrapper = undefined;
  });

  it('previews on hover and focus without committing until selection', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options },
    });
    expect(wrapper.find('.selected-color-badge').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.get('.select-trigger').classes()).toContain('is-open');
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(3);
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.querySelector('.thumbnail-img')).not.toBeNull();

    const option = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    const label = option.querySelector<HTMLElement>('.option-label')!;
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 120 });
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 20 });
    const beforePointerPreview = wrapper.emitted('preview:modelValue')?.length ?? 0;
    option.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('preview:modelValue')?.slice(beforePointerPreview)).toEqual([['two']]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    const beforeFocusPreview = wrapper.emitted('preview:modelValue')?.length ?? 0;
    option.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('preview:modelValue')?.slice(beforeFocusPreview)).toEqual([['two']]);

    const list = document.body.querySelector<HTMLElement>('.virtual-scroll-container')!;
    const beforeRestorePreview = wrapper.emitted('preview:modelValue')?.length ?? 0;
    list.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    await nextTick();
    expect(wrapper.emitted('preview:modelValue')?.slice(beforeRestorePreview)).toEqual([[null]]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    option.click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);
    wrapper.unmount();
  });

  it('commits with Enter and Space and cancels with Escape', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: { modelValue: 'one', options },
    });

    await wrapper.get('.select-trigger').trigger('click');
    const second = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    second.focus();
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['two']);
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);

    await wrapper.get('.select-trigger').trigger('click');
    const third = document.body.querySelectorAll<HTMLElement>('.select-option')[2];
    third.focus();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('preview:modelValue')).toContainEqual(['three']);
    third.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['three']);

    await wrapper.get('.select-trigger').trigger('click');
    const first = document.body.querySelectorAll<HTMLElement>('.select-option')[0];
    const updatesBeforeEscape = wrapper.emitted('update:modelValue')?.length ?? 0;
    const previewsBeforeEscape = wrapper.emitted('preview:modelValue')?.length ?? 0;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(updatesBeforeEscape);
    expect(wrapper.emitted('preview:modelValue')?.slice(previewsBeforeEscape)).toContainEqual([null]);
    expect(wrapper.get('.select-trigger').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('supports a two-line option slot and configurable option height', async () => {
    const wrapper = mount(Select, {
      attachTo: document.body,
      props: {
        modelValue: 'one',
        options: [
          { value: 'one', label: 'First option' },
          { value: 'two', label: 'Second option' },
        ],
        optionHeight: 58,
      },
      slots: {
        option: ({ option, previewing }) =>
          h('span', { class: 'two-line-option' }, [h('span', option.label), h('small', previewing ? 'Preview' : '')]),
      },
    });

    await wrapper.get('.select-trigger').trigger('click');
    const option = document.body.querySelector<HTMLElement>('[role="option"]')!;
    expect(option.style.height).toBe('58px');
    expect(option.querySelector('.two-line-option')).not.toBeNull();
    wrapper.unmount();
  });

  it('supports item aliases, placeholders, loading previews and disabled triggers', async () => {
    const wrapper = mount(Select, {
      props: { modelValue: null, items: options, placeholder: 'Choose an option', loading: true, disabled: true },
    });
    expect(wrapper.get('.select-label').text()).toBe('Choose an option');
    expect(wrapper.get('.select-label').classes()).toContain('is-placeholder');
    expect(wrapper.find('.selected-thumbnail-wrapper').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.find('.select-trigger').classes()).not.toContain('is-open');
  });

  it('supports size variants sm, md, and lg', () => {
    const sm = mount(Select, { props: { modelValue: 'one', options, size: 'sm' } });
    expect(sm.get('.select-trigger').classes()).toContain('select-sm');

    const md = mount(Select, { props: { modelValue: 'one', options, size: 'md' } });
    expect(md.get('.select-trigger').classes()).toContain('select-md');

    const lg = mount(Select, { props: { modelValue: 'one', options, size: 'lg' } });
    expect(lg.get('.select-trigger').classes()).toContain('select-lg');
  });

  it('fuzzy-filters searchable options without being sensitive to case or accents', async () => {
    const wrapper = mountSearchable({ modelValue: null, options: searchableOptions, variant: 'search' });

    await wrapper.get('.select-trigger').trigger('click');
    await setSearch('NTS');
    expect(visibleOptionLabels()).toEqual(['Noto Sans']);

    await setSearch('CAFE');
    expect(visibleOptionLabels()).toEqual(['Café Mono']);
  });

  it('supports keyboard navigation, selection, and Escape cancellation while searching', async () => {
    const wrapper = mountSearchable({ modelValue: null, options: searchableOptions, variant: 'search' });

    await wrapper.get('.select-trigger').trigger('click');
    await setSearch('cafe');
    searchInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    expect(document.activeElement?.getAttribute('role')).toBe('option');
    expect(document.activeElement?.textContent).toContain('Café Mono');

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['cafe']);

    await wrapper.get('.select-trigger').trigger('click');
    searchInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.get('.select-trigger').attributes('aria-expanded')).toBe('false');
  });

  it('shows the configured empty state when a search has no matches', async () => {
    const wrapper = mountSearchable({
      modelValue: null,
      options: searchableOptions,
      variant: 'search',
      emptyLabel: 'No matching fonts',
    });

    await wrapper.get('.select-trigger').trigger('click');
    await setSearch('does-not-exist');
    expect(document.body.querySelector('.options-empty')?.textContent).toBe('No matching fonts');
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('resets the search query and restores all options when reopened', async () => {
    const wrapper = mountSearchable({ modelValue: null, options: searchableOptions, variant: 'search' });

    await wrapper.get('.select-trigger').trigger('click');
    await setSearch('serif');
    expect(visibleOptionLabels()).toEqual(['Serif Display']);

    await wrapper.get('.select-trigger').trigger('click');
    await wrapper.get('.select-trigger').trigger('click');
    expect(searchInput().value).toBe('');
    expect(visibleOptionLabels()).toEqual(['Noto Sans', 'Café Mono', 'Serif Display']);
  });

  it('virtualizes a large search list instead of mounting every option', async () => {
    const largeOptions = Array.from({ length: 1_000 }, (_, index) => ({
      value: `font-${index}`,
      label: `Font ${index}`,
    }));
    const wrapper = mountSearchable({ modelValue: null, options: largeOptions, variant: 'search' });

    await wrapper.get('.select-trigger').trigger('click');

    const renderedOptions = document.body.querySelectorAll('[role="option"]');
    expect(renderedOptions.length).toBeGreaterThan(0);
    expect(renderedOptions.length).toBeLessThan(largeOptions.length);
    expect(renderedOptions.length).toBeLessThanOrEqual(20);
  });

  it('keeps a search trigger stable when loading changes from false to true', async () => {
    const wrapper = mountSearchable({
      modelValue: 'noto',
      options: [{ value: 'noto', label: 'Noto Sans' }],
      variant: 'search',
      loading: false,
    });
    const triggerContent = wrapper.get('.trigger-content-wrapper');
    const before = {
      html: triggerContent.html(),
      label: wrapper.get('.select-label').text(),
      children: triggerContent.element.children.length,
    };

    await wrapper.setProps({ loading: true });
    await nextTick();

    expect(wrapper.get('.select-label').text()).toBe(before.label);
    expect(wrapper.get('.trigger-content-wrapper').html()).toBe(before.html);
    expect(wrapper.get('.trigger-content-wrapper').element.children.length).toBe(before.children);
    expect(wrapper.find('.selected-thumbnail-wrapper').exists()).toBe(false);
    expect(wrapper.find('.trigger-thumbnail-img').exists()).toBe(false);
    expect(wrapper.find('.skeleton').exists()).toBe(false);
  });

  it('resets the virtual list to its first item when filtering after a scroll', async () => {
    const options = [
      ...Array.from({ length: 100 }, (_, index) => ({
        value: `font-${index}`,
        label: `Font ${index}`,
      })),
      { value: 'only-match', label: 'Only Match' },
    ];
    const wrapper = mountSearchable({ modelValue: null, options, variant: 'search' });

    await wrapper.get('.select-trigger').trigger('click');
    const container = document.body.querySelector<HTMLElement>('.virtual-scroll-container');
    if (!container) throw new Error('Expected a virtualized search list container.');
    container.scrollTop = 1_000;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
    await nextTick();
    expect(Number(document.body.querySelector('[role="option"]')?.getAttribute('data-option-index'))).toBeGreaterThan(
      0,
    );

    await setSearch('Only Match');
    await nextTick();

    expect(container.scrollTop).toBe(0);
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.body.querySelector('[role="option"]')?.getAttribute('data-option-index')).toBe('0');
    expect(visibleOptionLabels()).toEqual(['Only Match']);
  });
});
