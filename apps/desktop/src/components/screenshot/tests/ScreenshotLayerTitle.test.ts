import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it } from 'vitest';
import ScreenshotLayerTitle from '../ScreenshotLayerTitle.vue';
enableAutoUnmount(afterEach);
const create = () => mount(ScreenshotLayerTitle, { props: { name: 'Callout', active: true }, attachTo: document.body });

it('starts with only a title and single-clicks to select the entire name', async () => {
  const wrapper = create();
  expect(wrapper.find('input').exists()).toBe(false);
  expect(wrapper.get('h3').text()).toBe('Callout');
  await wrapper.get('button').trigger('click');
  await flushPromises();
  const field = wrapper.get('input').element as HTMLInputElement;
  expect(document.activeElement).toBe(field);
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 7]);
});
it('validates with Enter and restores title focus', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('click');
  await wrapper.get('input').setValue('  Heading  ');
  await wrapper.get('input').trigger('keydown', { key: 'Enter' });
  await flushPromises();
  expect(wrapper.emitted('rename')).toEqual([['Heading']]);
  expect(wrapper.find('input').exists()).toBe(false);
  expect(document.activeElement).toBe(wrapper.get('button').element);
});
it('cancels with Escape and restores title focus without renaming', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('click');
  await wrapper.get('input').setValue('Discard');
  await wrapper.get('input').trigger('keydown', { key: 'Escape' });
  await flushPromises();
  expect(wrapper.emitted('rename')).toBeUndefined();
  expect(document.activeElement).toBe(wrapper.get('button').element);
});
it('commits on blur without taking focus from the next control', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('click');
  await wrapper.get('input').setValue('Heading');
  await wrapper.get('input').trigger('blur');
  expect(wrapper.emitted('rename')).toEqual([['Heading']]);
  expect(document.activeElement).not.toBe(wrapper.get('button').element);
});
it.each([{ disabled: true }, { active: false }])(
  'discards a draft when editing becomes unavailable (%j)',
  async (props) => {
    const wrapper = create();
    await wrapper.get('button').trigger('click');
    await wrapper.get('input').setValue('Discard');
    await wrapper.setProps(props);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('button').trigger('click');
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.emitted('rename')).toBeUndefined();
  },
);
it('updates the title after undo or Composition rename', async () => {
  const wrapper = create();
  await wrapper.setProps({ name: 'Updated' });
  expect(wrapper.get('h3').text()).toBe('Updated');
});
