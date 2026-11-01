import { afterEach, expect, it } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import ScreenshotDockTools from '../ScreenshotDockTools.vue';
import type { ScreenshotDockTool, ScreenshotDockToolId } from '../screenshot-dock-types';

enableAutoUnmount(afterEach);
const tools: ScreenshotDockTool[] = [
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
  { id: 'shape', label: 'Shape', disabled: true },
];
const create = () =>
  mount(ScreenshotDockTools, {
    props: { tools: [...tools], active: ['text'], disabled: false },
    attachTo: document.body,
  });
const menuButton = () => document.querySelector<HTMLButtonElement>('.dock-tool-context button')!;
it('runs enabled tools normally and exposes active and draggable state', async () => {
  const wrapper = create();
  expect(wrapper.get('[data-dock-tool="text"] button').attributes('aria-pressed')).toBe('true');
  expect(wrapper.get('[data-dock-tool]').attributes('draggable')).toBe('true');
  await wrapper.get('button[aria-label="Arrow"]').trigger('click');
  expect(wrapper.emitted('run')).toEqual([['arrow']]);
  await wrapper.get('button[aria-label="Shape"]').trigger('click');
  expect(wrapper.emitted('run')).toHaveLength(1);
});
it('right-click removes only the selected shortcut, including an unavailable tool', async () => {
  const remaining = ref([...tools]);
  const host = mount(
    defineComponent({
      setup: () => () =>
        h(ScreenshotDockTools, {
          tools: remaining.value,
          active: [],
          disabled: false,
          onRemove: (id: ScreenshotDockToolId) => {
            remaining.value = remaining.value.filter((tool) => tool.id !== id);
          },
        }),
    }),
    { attachTo: document.body },
  );
  const wrapper = host.findComponent(ScreenshotDockTools);
  await wrapper.get('[data-dock-tool="shape"]').trigger('contextmenu', { clientX: 200, clientY: 100 });
  await nextTick();
  expect(menuButton().textContent).toContain('Remove from toolbar');
  expect(document.activeElement).toBe(menuButton());
  menuButton().click();
  await nextTick();
  await nextTick();
  expect(wrapper.emitted('remove')).toEqual([['shape']]);
  expect(wrapper.emitted('run')).toBeUndefined();
  expect(document.activeElement).toBe(wrapper.get('button[aria-label="Text"]').element);
});
it('opens with the context-menu key or Shift+F10 and restores keyboard focus on Escape', async () => {
  const wrapper = create();
  await wrapper.get('[data-dock-tool="arrow"]').trigger('keydown', { key: 'ContextMenu' });
  await nextTick();
  expect(menuButton()).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await nextTick();
  expect(document.activeElement).toBe(wrapper.get('button[aria-label="Arrow"]').element);
  await wrapper.get('[data-dock-tool="text"]').trigger('keydown', { key: 'F10', shiftKey: true });
  await nextTick();
  expect(menuButton()).not.toBeNull();
});
it('moves tools by insertion boundary with Alt+arrows and leaves normal arrows alone', async () => {
  const wrapper = create(),
    entry = wrapper.get('[data-dock-tool="text"]');
  await entry.trigger('keydown', { key: 'ArrowLeft', altKey: true });
  await entry.trigger('keydown', { key: 'ArrowRight', altKey: true });
  await entry.trigger('keydown', { key: 'ArrowRight' });
  expect(wrapper.emitted('reorder')).toEqual([
    ['text', 0],
    ['text', 3],
  ]);
  expect(document.activeElement).toBe(wrapper.get('button[aria-label="Text"]').element);
});
it('blocks personalization while disabled and closes a menu when cropping starts', async () => {
  const wrapper = create();
  await wrapper.get('[data-dock-tool="arrow"]').trigger('contextmenu');
  await nextTick();
  await wrapper.setProps({ disabled: true });
  await wrapper.get('[data-dock-tool="text"]').trigger('contextmenu');
  await wrapper.get('[data-dock-tool="text"]').trigger('keydown', { key: 'ArrowLeft', altKey: true });
  expect(wrapper.emitted('reorder')).toBeUndefined();
  expect(wrapper.get('[data-dock-tool]').attributes('draggable')).toBe('false');
  await wrapper.setProps({ disabled: false });
  await wrapper.get('[data-dock-tool="arrow"]').trigger('contextmenu');
  await nextTick();
  await wrapper.setProps({ tools: tools.slice(1) });
  expect(wrapper.emitted('remove')).toBeUndefined();
});
it('marks native drag insertion, reorders on drop and never activates the dragged tool', async () => {
  const wrapper = create();
  wrapper.findAll('[data-dock-tool]').forEach((entry, index) => {
    entry.element.getBoundingClientRect = () => new DOMRect(index * 38, 0, 36, 36);
  });
  const shape = wrapper.get('[data-dock-tool="shape"]');
  await shape.trigger('dragstart');
  await wrapper.get('button[aria-label="Arrow"]').trigger('click');
  expect(wrapper.emitted('run')).toBeUndefined();
  await wrapper.get('.dock-tools').trigger('dragover', { clientX: 0 });
  expect(wrapper.get('[data-dock-tool="arrow"]').classes()).toContain('insert-before');
  await wrapper.get('.dock-tools').trigger('drop', { clientX: 0 });
  expect(wrapper.emitted('reorder')).toEqual([['shape', 0]]);
  expect(wrapper.find('.is-dragging').exists()).toBe(false);
  await wrapper.get('[data-dock-tool="arrow"]').trigger('dragstart');
  await wrapper.get('.dock-tools').trigger('dragover', { clientX: 200 });
  expect(shape.classes()).toContain('insert-after');
  await wrapper.get('.dock-tools').trigger('dragleave');
  await wrapper.get('[data-dock-tool="arrow"]').trigger('dragend');
  expect(wrapper.find('.insert-after').exists()).toBe(false);
});
