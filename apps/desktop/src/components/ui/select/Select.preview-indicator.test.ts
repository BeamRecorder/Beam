import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import Select from './Select.vue';

enableAutoUnmount(afterEach);

const options = [
  { value: 'one', label: 'First option' },
  { value: 'two', label: 'Second option' },
];
const mountSelect = async (showPreviewIndicator?: boolean) => {
  const wrapper = mount(Select, {
    attachTo: document.body,
    props: { modelValue: 'one', options, showPreviewIndicator },
  });
  await wrapper.get('.select-trigger').trigger('click');
  return wrapper;
};
const optionAt = (index: number) => document.querySelectorAll<HTMLElement>('[role="option"]')[index]!;

describe('Select preview indicator', () => {
  it.each(['pointerenter', 'focus'])('keeps ordinary menus free of preview eyes on %s', async (event) => {
    const wrapper = await mountSelect();
    optionAt(1).dispatchEvent(new Event(event));
    await nextTick();
    expect(document.querySelector('.option-eye')).toBeNull();
    expect(optionAt(0).querySelector('.lucide-check')).not.toBeNull();
    // The indicator is a presentation option; existing preview listeners keep working.
    expect(wrapper.emitted('preview:modelValue')).toContainEqual(['two']);
    optionAt(1).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['two']]);
  });

  it.each(['pointerenter', 'focus'])(
    'shows an opted-in preview eye on %s without changing selection',
    async (event) => {
      const wrapper = await mountSelect(true);
      optionAt(1).dispatchEvent(new Event(event));
      await nextTick();
      expect(optionAt(1).querySelector('.option-eye')?.getAttribute('aria-hidden')).toBe('true');
      expect(optionAt(1).getAttribute('aria-selected')).toBe('false');
      expect(optionAt(0).querySelector('.lucide-check')).not.toBeNull();
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    },
  );

  it('keeps the selection check instead of an eye when previewing the selected option', async () => {
    await mountSelect(true);
    optionAt(0).dispatchEvent(new Event('pointerenter'));
    await nextTick();
    expect(document.querySelector('.option-eye')).toBeNull();
    expect(optionAt(0).querySelector('.lucide-check')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('responds to the indicator parameter while a menu is open', async () => {
    const wrapper = await mountSelect(false);
    optionAt(1).dispatchEvent(new Event('pointerenter'));
    await nextTick();
    expect(document.querySelector('.option-eye')).toBeNull();
    await wrapper.setProps({ showPreviewIndicator: true });
    expect(document.querySelector('.option-eye')).not.toBeNull();
    await wrapper.setProps({ showPreviewIndicator: false });
    expect(document.querySelector('.option-eye')).toBeNull();
    expect(optionAt(0).getAttribute('aria-selected')).toBe('true');
  });

  it('clears the preview eye on pointer leave and closes without changing the selection', async () => {
    const wrapper = await mountSelect(true);
    optionAt(1).dispatchEvent(new Event('pointerenter'));
    await nextTick();
    optionAt(1).dispatchEvent(new Event('pointerleave'));
    await nextTick();
    expect(document.querySelector('.option-eye')).toBeNull();
    expect(wrapper.emitted('preview:modelValue')).toContainEqual([null]);
    await wrapper.get('.select-trigger').trigger('click');
    expect(document.querySelector('[role="option"]')).toBeNull();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
