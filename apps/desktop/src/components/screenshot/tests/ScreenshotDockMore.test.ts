import { afterEach, expect, it } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ScreenshotDockMore from '../ScreenshotDockMore.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';

enableAutoUnmount(afterEach);
const create = (disabled = false) =>
  mount(ScreenshotDockMore, {
    props: { disabled, items: [{ id: 'blur', label: 'Blur' }] },
    attachTo: document.body,
  });
it('opens a menu above its trigger and announces its expanded state', async () => {
  const wrapper = create();
  expect(wrapper.findComponent(Popover).props()).toMatchObject({ direction: 'up', matchTriggerWidth: false });
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
  await wrapper.get('button').trigger('click');
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
  expect(document.querySelector('[role="menuitem"]')?.textContent).toContain('Blur');
  expect(document.querySelector('.dock-menu-heading')?.textContent).toContain('Personalize dock');
  expect(document.querySelector('.dock-menu-heading')?.textContent).toContain('Drag tools to reorder');
  expect(document.querySelector('.dock-menu-section')?.textContent).toBe('More tools');
});
it('selects a tool, closes the menu and restores focus to the native button', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('click');
  (document.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
  await nextTick();
  await nextTick();
  expect(wrapper.emitted('select')).toEqual([['blur']]);
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(wrapper.get('button').element);
});
it('restores focus on dismissal and blocks opening when disabled', async () => {
  const wrapper = create();
  await wrapper.get('button').trigger('click');
  wrapper.findComponent(PopoverMenuList).vm.$emit('dismiss');
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(wrapper.get('button').element);
  expect(wrapper.emitted('select')).toBeUndefined();
  await wrapper.setProps({ disabled: true });
  await wrapper.get('button').trigger('click');
  expect(wrapper.get('button').attributes('aria-expanded')).toBe('false');
});
