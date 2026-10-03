import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideEditorSearch } from '../useEditorSearch';
import EditorSpotlight from '../EditorSpotlight.vue';
import EditorSearchButton from '../EditorSearchButton.vue';
import EditorHistoryControls from '../../EditorHistoryControls.vue';
import TimelineAddMenu from '../../timeline/TimelineAddMenu.vue';
import type { EditorSearchContext } from '../editor-search-types';
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.unstubAllGlobals();
});
const fixture = () => {
  let context!: EditorSearchContext;
  const canRedo = ref(false);
  const navigate = vi.fn(),
    select = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        context = provideEditorSearch({
          mode: 'video',
          canInsert: () => true,
          canEditClip: () => false,
          clipKind: () => undefined,
          insert: vi.fn(),
          selections: () => [
            {
              id: 'clip:hero',
              label: 'Hero recording',
              group: 'selection',
              run: select,
            },
          ],
        });
        return () =>
          h('div', [
            h(EditorSearchButton),
            h(EditorSpotlight, { navigate }),
            h(EditorHistoryControls, { canUndo: true, canRedo: canRedo.value }),
            h(TimelineAddMenu),
          ]);
      },
    }),
    { attachTo: document.body, global: { stubs: { teleport: true } } },
  );
  return { context, wrapper, navigate, select, canRedo };
};
const shortcut = (extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  window.dispatchEvent(event);
  return event;
};
describe('editor Spotlight integration', () => {
  it('opens via Ctrl+F and Cmd+F, focuses the rounded input and restores keyboard focus on Escape', async () => {
    const f = fixture();
    await flushPromises();
    const launcher = f.wrapper.get('button[aria-label="Search the editor"]');
    (launcher.element as HTMLButtonElement).focus();
    expect(shortcut().defaultPrevented).toBe(true);
    await flushPromises();
    expect(f.context.open.value).toBe(true);
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(f.context.open.value).toBe(false);
    expect(document.activeElement).toBe(launcher.element);
    shortcut({ ctrlKey: false, metaKey: true });
    await flushPromises();
    expect(f.context.open.value).toBe(true);
  });
  it('ignores repeats, modified shortcuts, unrelated keys and another modal, then cleans up its navigator', async () => {
    const f = fixture();
    await flushPromises();
    for (const extra of [{ repeat: true }, { altKey: true }, { shiftKey: true }, { key: 'g' }, { ctrlKey: false }])
      expect(shortcut(extra).defaultPrevented).toBe(false);
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    expect(shortcut().defaultPrevented).toBe(false);
    modal.remove();
    f.context.setNavigator(vi.fn())();
    expect(shortcut().defaultPrevented).toBe(false);
    f.wrapper.unmount();
    expect(f.context.ready.value).toBe(false);
    expect(shortcut().defaultPrevented).toBe(false);
  });
  it('searches project clips, routes into Clip and exposes the same voiceover/history actors as their controls', async () => {
    const f = fixture();
    await flushPromises();
    await f.wrapper.get('button[aria-label="Search the editor"]').trigger('click');
    await flushPromises();
    await f.wrapper.get('input[role="combobox"]').setValue('Hero recording');
    const surface = f.wrapper.get('.command-list').element;
    await f.wrapper.get('input[role="combobox"]').setValue('Hero');
    expect(f.wrapper.get('.command-list').element).toBe(surface);
    await f.wrapper.get('input[role="combobox"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(f.select).toHaveBeenCalledOnce();
    expect(f.navigate).toHaveBeenCalledWith('clip');
    const history = f.wrapper.findComponent(EditorHistoryControls);
    expect(f.context.actions.value.find((action) => action.id === 'action:redo')?.disabled).toBe(true);
    await f.context.actions.value.find((action) => action.id === 'action:undo')!.run();
    expect(history.emitted('undo')).toHaveLength(1);
    f.canRedo.value = true;
    await nextTick();
    await f.context.actions.value.find((action) => action.id === 'action:redo')!.run();
    expect(history.emitted('redo')).toHaveLength(1);
    await f.context.actions.value.find((action) => action.id === 'insert:voiceover')!.run();
    expect(f.wrapper.findComponent(TimelineAddMenu).emitted('add:element')).toEqual([['voiceover']]);
    await nextTick();
    f.wrapper.unmount();
    expect(f.context.actions.value.some((action) => action.id === 'action:undo')).toBe(false);
  });
  it('keeps launchers optional and uses the macOS shortcut hint', () => {
    const missing = mount(EditorSearchButton);
    expect(missing.find('button').exists()).toBe(false);
    missing.unmount();
    vi.stubGlobal('capture', { platform: 'darwin' });
    const f = fixture();
    expect(f.wrapper.findComponent(EditorSearchButton).findComponent({ name: 'Button' }).props('tooltip')).toContain(
      '⌘F',
    );
  });
});
