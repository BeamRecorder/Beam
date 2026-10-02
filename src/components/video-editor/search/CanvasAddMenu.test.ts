import { computed, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import CanvasAddMenu from './CanvasAddMenu.vue';
import { editorSearchKey, type EditorSearchAction, type EditorSearchContext } from './editor-search-types';
import ContextMenu from '~/ui/context-menu/ContextMenu.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
enableAutoUnmount(afterEach);
const harness = (actions: EditorSearchAction[]) => {
  const search: EditorSearchContext = {
    open: ref(false),
    ready: ref(true),
    actions: computed(() => actions),
    items: computed(() => []),
    navigate: vi.fn(),
    setVisibleActions: vi.fn(),
    registerActions: vi.fn(),
    setNavigator: vi.fn(),
  };
  return mount(CanvasAddMenu, {
    attachTo: document.body,
    global: { provide: { [editorSearchKey as symbol]: search } },
  });
};
it('uses the exact live insertion actions and focuses the menu', async () => {
  const run = vi.fn();
  const wrapper = harness([
    { id: 'insert:shape', label: 'Shape', group: 'insert', run },
    { id: 'clip:c', label: 'Clip', group: 'selection', run },
  ]);
  await (wrapper.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(
    new MouseEvent('dblclick', { clientX: 100, clientY: 100 }),
  );
  await flushPromises();
  expect(wrapper.findComponent(PopoverMenuList).props('items')).toHaveLength(1);
  expect(document.activeElement?.textContent).toContain('Elements');
  expect(
    (
      wrapper.findComponent(PopoverMenuList).props('items') as ReadonlyArray<{
        children?: ReadonlyArray<{ label: string }>;
      }>
    )[0]?.children?.[0]?.label,
  ).toBe('Shape');
  wrapper.findComponent(PopoverMenuList).vm.$emit('select', 'insert:shape');
  await flushPromises();
  expect(run).toHaveBeenCalledOnce();
  expect(wrapper.findComponent(ContextMenu).vm.isOpen).toBe(false);
});
it('does not open without a provider, without actions or for modified clicks', async () => {
  const empty = mount(CanvasAddMenu);
  await (empty.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(new MouseEvent('dblclick'));
  expect(empty.findComponent(ContextMenu).vm.isOpen).toBe(false);
  const wrapper = harness([{ id: 'insert:shape', label: 'Shape', group: 'insert', run: vi.fn() }]);
  for (const init of [{ button: 2 }, { metaKey: true }, { ctrlKey: true }])
    await (wrapper.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(new MouseEvent('dblclick', init));
  expect(wrapper.findComponent(ContextMenu).vm.isOpen).toBe(false);
});
it('respects disabled and missing actions, closes on Escape and reports insertion failures', async () => {
  const run = vi.fn().mockRejectedValue(new Error('image unavailable'));
  const wrapper = harness([
    { id: 'insert:image', label: 'Image', group: 'insert', run },
    { id: 'insert:shape', label: 'Shape', group: 'insert', disabled: true, run },
  ]);
  await (wrapper.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(new MouseEvent('dblclick'));
  await flushPromises();
  const list = wrapper.findComponent(PopoverMenuList);
  list.vm.$emit('select', 'missing');
  list.vm.$emit('select', 'insert:shape');
  expect(run).not.toHaveBeenCalled();
  list.vm.$emit('dismiss');
  await flushPromises();
  expect(wrapper.findComponent(ContextMenu).vm.isOpen).toBe(false);
  await (wrapper.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(new MouseEvent('dblclick'));
  await flushPromises();
  wrapper.findComponent(PopoverMenuList).vm.$emit('select', 'insert:image');
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('image unavailable');
  await (wrapper.vm as unknown as { open(event: MouseEvent): Promise<void> }).open(new MouseEvent('dblclick'));
  expect(wrapper.find('[role="alert"]').exists()).toBe(false);
});
