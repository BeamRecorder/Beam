import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ScreenshotLayerName from '../ScreenshotLayerName.vue';
enableAutoUnmount(afterEach);
const create = (inline = false) =>
  mount(ScreenshotLayerName, { props: { name: 'Callout', inline }, attachTo: document.body });

it('commits a trimmed name on Enter once, without leaking shortcuts to the editor', async () => {
  const wrapper = create();
  const field = wrapper.get('input');
  await field.setValue('  Heading  ');
  await field.trigger('pointerdown');
  await field.trigger('click');
  await field.trigger('dblclick');
  await field.trigger('keydown', { key: 'Enter' });
  await field.trigger('blur');
  expect(wrapper.emitted('rename')).toEqual([['Heading']]);
  expect(wrapper.emitted('finish')).toEqual([[true]]);
  await wrapper.setProps({ name: 'Heading' });
  await field.setValue('Subheading');
  await field.trigger('blur');
  expect(wrapper.emitted('rename')).toEqual([['Heading'], ['Subheading']]);
});
it('focuses and selects the inline name, then commits on blur without stealing focus back', async () => {
  const wrapper = create(true);
  await flushPromises();
  const field = wrapper.get('input');
  const element = field.element as HTMLInputElement;
  expect(document.activeElement).toBe(element);
  expect(element.selectionStart).toBe(0);
  expect(element.selectionEnd).toBe('Callout'.length);
  await field.setValue('Renamed');
  await field.trigger('blur');
  expect(wrapper.emitted('rename')).toEqual([['Renamed']]);
  expect(wrapper.emitted('finish')).toEqual([[false]]);
  expect(wrapper.find('label > span').exists()).toBe(false);
});
it('cancels edits with Escape and does not commit them on a subsequent blur', async () => {
  const wrapper = create(true);
  const field = wrapper.get('input');
  await field.setValue('Discard this');
  await field.trigger('keydown', { key: 'Escape' });
  await field.trigger('blur');
  expect((field.element as HTMLInputElement).value).toBe('Callout');
  expect(wrapper.emitted('rename')).toBeUndefined();
  expect(wrapper.emitted('finish')).toEqual([[true]]);
});
it.each(['', '   ', 'Callout', 'x'.repeat(201)])(
  'preserves the existing name for an empty, invalid or unchanged draft (%j)',
  async (draft) => {
    const wrapper = create();
    await wrapper.get('input').setValue(draft);
    await wrapper.get('input').trigger('blur');
    expect(wrapper.emitted('rename')).toBeUndefined();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Callout');
  },
);
it('rejects a pending change if the layer becomes locked and follows external rename/undo', async () => {
  const wrapper = create();
  await wrapper.get('input').setValue('Pending');
  await wrapper.setProps({ disabled: true });
  await wrapper.get('input').trigger('blur');
  expect(wrapper.emitted('rename')).toBeUndefined();
  await wrapper.setProps({ name: 'Restored', disabled: false });
  expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Restored');
  expect(wrapper.get('label > span').text()).toBe('Layer name');
});
