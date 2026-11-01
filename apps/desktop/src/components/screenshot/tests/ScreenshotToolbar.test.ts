import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import type { Ref } from 'vue';
import ScreenshotToolbar from '../ScreenshotToolbar.vue';
import type { ScreenshotToolbarProps } from '../screenshot-toolbar-types';
import type * as CoreModule from '@vueuse/core';

const size = vi.hoisted(() => ({ height: null as Ref<number> | null, options: null as unknown }));
vi.mock('~/api/capture', () => ({
  capture: {
    updatePreferences: async (patch: { extras: Record<string, unknown> }) => ({
      extras: patch.extras,
      shortcuts: {},
      schemaVersion: 3,
    }),
  },
}));
beforeEach(() => setActivePinia(createPinia()));
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  const { ref } = await import('vue');
  return {
    ...actual,
    useElementSize: (_target: unknown, _initial: unknown, options: unknown) => {
      size.options = options;
      size.height = ref(50);
      return { width: ref(640), height: size.height };
    },
  };
});

const wrappers: ReturnType<typeof mount>[] = [];
const makeToolbar = (props: Partial<ScreenshotToolbarProps> = {}) => {
  const wrapper = mount(ScreenshotToolbar, {
    attachTo: document.body,
    props: {
      disabled: false,
      cropping: false,
      canCrop: true,
      drawing: false,
      editingText: false,
      panel: 'canvas',
      inspectorOpen: true,
      canUndo: false,
      canRedo: false,
      ...props,
    },
    global: {
      stubs: {
        ScreenshotDockMore: {
          name: 'ScreenshotDockMore',
          props: ['disabled', 'items'],
          template: '<button :disabled="disabled" aria-label="More tools">…</button>',
        },
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe('Screenshot toolbar', () => {
  it('reports its height when the dock wraps or UI scaling changes', async () => {
    const wrapper = makeToolbar();
    expect(size.options).toEqual({ box: 'border-box' });
    size.height!.value = 96;
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('resize')).toEqual([[96]]);
  });
  it('offers Arrow before the other direct tools and retains More for customization', async () => {
    const wrapper = makeToolbar();
    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Tools');
    for (const [label, kind] of [
      ['Arrow', 'arrow'],
      ['Text', 'text'],
      ['Shape', 'shape'],
      ['Draw', 'drawing'],
      ['Image', 'image'],
    ]) {
      await wrapper.get(`button[aria-label="${label}"]`).trigger('click');
      expect(wrapper.emitted('add')?.at(-1)).toEqual([kind]);
    }
    expect(wrapper.findComponent({ name: 'ScreenshotDockMore' }).exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Group"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Ungroup"]').exists()).toBe(false);
  });

  it('exposes crop and canvas actions without dimensions or settings in the editing dock', async () => {
    const wrapper = makeToolbar({ cropping: true, panel: 'canvas' });
    expect(wrapper.get('button[aria-label="Confirm crop"]').text()).toBe('OK');
    expect(wrapper.get('button[aria-label="Confirm crop"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Select"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('button[aria-label="Settings"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Dimensions"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Confirm crop"]').trigger('click');
    expect(wrapper.emitted('crop')).toEqual([[]]);
    await wrapper.setProps({ cropping: false });
    await wrapper.get('button[aria-label="Canvas"]').trigger('click');
    expect(wrapper.emitted('canvas')).toEqual([[]]);
  });

  it('allows leaving drawing and crop mode while blocking insertion during cropping', async () => {
    const wrapper = makeToolbar({ drawing: true, cropping: true });
    expect(wrapper.get('button[aria-label="Draw"]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('button[aria-label="Select"]').trigger('click');
    await wrapper.get('button[aria-label="Text"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([[]]);
    expect(wrapper.emitted('add')).toBeUndefined();
  });

  it('marks text editing as the active tool rather than selection', () => {
    const wrapper = makeToolbar({ editingText: true });
    expect(wrapper.get('button[aria-label="Text"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Select"]').attributes('aria-pressed')).toBe('false');
  });

  it('keeps undo and redo accessible inside the dock with their history availability', async () => {
    const wrapper = makeToolbar({ canUndo: true, canRedo: true });
    await wrapper.get('button[aria-label="Undo (Ctrl+Z)"]').trigger('click');
    await wrapper.get('button[aria-label="Redo (Ctrl+Y)"]').trigger('click');
    expect(wrapper.emitted('undo')).toEqual([[]]);
    expect(wrapper.emitted('redo')).toEqual([[]]);
    await wrapper.setProps({ canUndo: false, canRedo: false });
    expect(wrapper.get('button[aria-label="Undo (Ctrl+Z)"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[aria-label="Redo (Ctrl+Y)"]').attributes('disabled')).toBeDefined();
  });

  it('blocks available history actions while busy', () => {
    const wrapper = makeToolbar({ canUndo: true, canRedo: true, disabled: true });
    expect(wrapper.get('button[aria-label="Undo (Ctrl+Z)"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button[aria-label="Redo (Ctrl+Y)"]').attributes('disabled')).toBeDefined();
  });

  it('blocks all actions when busy and blocks crop for unavailable or locked images', async () => {
    const wrapper = makeToolbar({ disabled: true });
    expect(wrapper.findAll('button').every((button) => (button.element as HTMLButtonElement).disabled)).toBe(true);
    await wrapper.setProps({ disabled: false, canCrop: false });
    expect(wrapper.get('button[aria-label="Crop"]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[aria-label="Crop"]').trigger('click');
    expect(wrapper.emitted('crop')).toBeUndefined();
  });

  it('does not mark a hidden inspector section as active', () => {
    const wrapper = makeToolbar({ inspectorOpen: false });
    expect(wrapper.get('button[aria-label="Canvas"]').attributes('aria-pressed')).toBe('false');
  });

  it('keeps a labeled Properties toggle available without changing the active section or tool', async () => {
    const wrapper = makeToolbar({
      inspectorOpen: false,
      panel: 'shapes',
      drawing: true,
    });
    const toggle = wrapper.get('button[aria-label="Properties"]');
    expect(toggle.text()).toBe('Properties');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(toggle.attributes('aria-controls')).toBe('screenshot-properties-panel');
    await toggle.trigger('click');
    expect(wrapper.emitted('toggleInspector')).toEqual([[]]);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('canvas')).toBeUndefined();
    await wrapper.setProps({ inspectorOpen: true });
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Draw"]').attributes('aria-pressed')).toBe('true');
  });

  it('allows toggling properties while cropping and prevents it while busy', async () => {
    const wrapper = makeToolbar({ cropping: true });
    await wrapper.get('button[aria-label="Properties"]').trigger('click');
    expect(wrapper.emitted('toggleInspector')).toHaveLength(1);
    await wrapper.setProps({ disabled: true });
    await wrapper.get('button[aria-label="Properties"]').trigger('click');
    expect(wrapper.emitted('toggleInspector')).toHaveLength(1);
  });

  it.each([true, false])('restores keyboard focus to the properties toggle (open: %s)', (inspectorOpen) => {
    const wrapper = makeToolbar({ inspectorOpen });
    wrapper.vm.focusInspector();
    expect(document.activeElement).toBe(wrapper.get('button[aria-label="Properties"]').element);
  });

  it('does not focus a disabled properties toggle', () => {
    const wrapper = makeToolbar({ disabled: true });
    wrapper.vm.focusInspector();
    expect(document.activeElement).not.toBe(wrapper.get('button[aria-label="Properties"]').element);
  });

  it('moves keyboard focus between enabled buttons and wraps in both directions', async () => {
    const wrapper = makeToolbar({ canCrop: false });
    const first = wrapper.get('button[aria-label="Select"]');
    const next = wrapper.get('button[aria-label="Arrow"]');
    const last = wrapper.get('button[aria-label="Properties"]');
    (first.element as HTMLElement).focus();
    await first.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(next.element);
    await first.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(first.element);
  });

  it('supports Home and End without intercepting modified keys or other controls', async () => {
    const wrapper = makeToolbar();
    const first = wrapper.get('button[aria-label="Select"]');
    const last = wrapper.get('button[aria-label="Properties"]');
    (first.element as HTMLElement).focus();
    await first.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(last.element);
    await last.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(first.element);
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      await first.trigger('keydown', { key: 'ArrowRight', [modifier]: true });
    }
    await first.trigger('keydown', { key: 'Enter' });
    await wrapper.get('[role="toolbar"]').trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(first.element);
  });
});

it('adds grouping from More only when selected and keeps it as a pinned tool', async () => {
  const wrapper = makeToolbar({ canGroup: true, canUngroup: true });
  const more = wrapper.findComponent({ name: 'ScreenshotDockMore' });
  expect(more.props('items')).toContainEqual(expect.objectContaining({ id: 'reset-tools', separatorBefore: true }));
  more.vm.$emit('select', 'group');
  more.vm.$emit('select', 'ungroup');
  await flushPromises();
  expect(wrapper.emitted('group')).toEqual([[]]);
  expect(wrapper.emitted('ungroup')).toEqual([[]]);
  expect(wrapper.find('button[aria-label="Group"]').exists()).toBe(true);
  expect(wrapper.find('button[aria-label="Ungroup"]').exists()).toBe(true);
});
it('keeps unavailable group actions disabled in More', () => {
  const wrapper = makeToolbar();
  const items = wrapper.findComponent({ name: 'ScreenshotDockMore' }).props('items');
  expect(items.find((item: { id: string }) => item.id === 'group')?.disabled).toBe(true);
  expect(items.find((item: { id: string }) => item.id === 'ungroup')?.disabled).toBe(true);
});
it('retains selection-specific instructions on an optional pinned Group tool', async () => {
  const { default: Button } = await import('~/ui/button/Button.vue');
  const wrapper = makeToolbar({ canGroup: true });
  wrapper.findComponent({ name: 'ScreenshotDockMore' }).vm.$emit('select', 'group');
  await flushPromises();
  const group = () =>
    wrapper.findAllComponents(Button).find((button) => button.find('button[aria-label="Group"]').exists())!;
  expect(group().props('tooltip')).toBe('Group · Ctrl+G');
  await wrapper.setProps({ canGroup: false, groupDisabledReason: 'selectOneMoreToGroup' });
  expect(group().props('tooltip')).toBe('Select 1 more element to group');
  await wrapper.setProps({ groupDisabledReason: 'alreadyGrouped' });
  expect(group().props('tooltip')).toBe('These elements are already grouped');
});
it('pins a chosen tool, removes it, resets defaults and rejects unavailable or unknown menu actions', async () => {
  const wrapper = makeToolbar();
  const more = wrapper.findComponent({ name: 'ScreenshotDockMore' });
  more.vm.$emit('select', 'blur');
  await flushPromises();
  expect(wrapper.find('button[aria-label="Blur"]').exists()).toBe(true);
  expect(wrapper.emitted('add')?.at(-1)).toEqual(['blur']);
  more.vm.$emit('select', 'remove:blur');
  await flushPromises();
  expect(wrapper.find('button[aria-label="Blur"]').exists()).toBe(false);
  more.vm.$emit('select', 'remove:arrow');
  more.vm.$emit('select', 'reset-tools');
  await flushPromises();
  expect(wrapper.find('button[aria-label="Arrow"]').exists()).toBe(true);
  const count = wrapper.emitted('add')?.length;
  more.vm.$emit('select', 'video');
  more.vm.$emit('select', 'remove:unknown');
  more.vm.$emit('select', 'group');
  await wrapper.setProps({ cropping: true });
  more.vm.$emit('select', 'cursor');
  expect(wrapper.emitted('add')?.length).toBe(count);
});
it('persists order and removals emitted by the dock without activating a tool', async () => {
  const wrapper = makeToolbar(),
    tools = wrapper.findComponent({ name: 'ScreenshotDockTools' });
  tools.vm.$emit('reorder', 'shape', 0);
  await flushPromises();
  expect(
    wrapper
      .findAll('[data-dock-tool]')
      .map((entry) => entry.attributes('data-dock-tool'))
      .slice(0, 3),
  ).toEqual(['shape', 'arrow', 'text']);
  tools.vm.$emit('remove', 'text');
  await flushPromises();
  expect(wrapper.find('[data-dock-tool="text"]').exists()).toBe(false);
  expect(wrapper.emitted('add')).toBeUndefined();
});
