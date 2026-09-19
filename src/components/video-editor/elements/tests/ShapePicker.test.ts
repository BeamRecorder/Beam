import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { SHAPE_CATALOG } from '~/media/shared/shape-catalog';
import ShapePicker from '../ShapePicker.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'shapeCount' ? `${params?.count} shapes` : key === 'shape' ? 'Shape' : key,
  }),
}));

const wrappers: VueWrapper[] = [];
const mountPicker = (props: Record<string, unknown> = {}) => {
  const wrapper = mount(ShapePicker, {
    attachTo: document.body,
    props: { modelValue: 'rectangle', ...props },
    global: { stubs: { Tooltip: { template: '<div><slot /></div>' } } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const body = () => new DOMWrapper(document.body);

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

describe('ShapePicker', () => {
  it('opens a searchable library with a preview for every shape', async () => {
    const wrapper = mountPicker();
    await wrapper.get('[aria-label="Shape: Rectangle"]').trigger('click');
    await nextTick();

    expect(body().get('[role="listbox"]').findAll('[role="option"]')).toHaveLength(SHAPE_CATALOG.length);
    expect(body().get('[aria-label="Heart"]').find('svg path').attributes('d')).toMatch(/^M/);
    expect(body().text()).toContain(`${SHAPE_CATALOG.length} shapes`);

    await body().get('.shape-picker').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(body().find('[role="listbox"]').exists()).toBe(false);
  });

  it('uses accent-insensitive fuzzy search and shows an empty state', async () => {
    const wrapper = mountPicker();
    await wrapper.get('[aria-label="Shape: Rectangle"]').trigger('click');
    await nextTick();
    const search = body().get('input[aria-label="searchShapes"]');

    await search.setValue('eclair');
    expect(body().findAll('[role="option"]')).toHaveLength(1);
    expect(body().get('[role="option"]').attributes('aria-label')).toBe('Lightning');

    await search.setValue('definitely absent');
    expect(body().find('[role="listbox"]').exists()).toBe(false);
    expect(body().text()).toContain('noShapeResults');
  });

  it('emits the chosen vector and closes the popover while respecting disabled state', async () => {
    const wrapper = mountPicker();
    await wrapper.get('[aria-label="Shape: Rectangle"]').trigger('click');
    await nextTick();
    await body().get('[aria-label="Heart"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toEqual([['heart']]);
    expect(wrapper.emitted('select')).toEqual([['heart']]);
    expect(body().find('[role="listbox"]').exists()).toBe(false);

    const disabled = mountPicker({ disabled: true });
    await disabled.get('[aria-label="Shape: Rectangle"]').trigger('click');
    await nextTick();
    expect(body().find('[role="listbox"]').exists()).toBe(false);
  });
});
