import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScreenshotSearch from '../ScreenshotSearch.vue';
import EditorSearchButton from '../../search/EditorSearchButton.vue';
import { provideEditorSearch } from '../../search/useEditorSearch';
import type { EditorSearchContext } from '../../search/editor-search-types';
import { setCurrentLocale } from '~/i18n';

const focus = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../search/focus-editor-property', () => ({ focusEditorProperty: focus }));
enableAutoUnmount(afterEach);
afterEach(() => focus.mockReset().mockResolvedValue(true));

const fixture = () => {
  let context!: EditorSearchContext;
  const navigate = vi.fn();
  const props = reactive({ navigate, disabled: false, canCrop: true, canFullscreen: true });
  const wrapper = mount(
    defineComponent({
      setup() {
        context = provideEditorSearch({
          mode: 'screenshot',
          canInsert: () => true,
          canEditClip: () => false,
          clipKind: () => undefined,
          insert: vi.fn(),
          selections: () => [],
        });
        return () => h('div', [h(EditorSearchButton), h(ScreenshotSearch, props)]);
      },
    }),
    { attachTo: document.body, global: { stubs: { teleport: true } } },
  );
  const search = wrapper.findComponent(ScreenshotSearch);
  return {
    context,
    wrapper,
    search,
    navigate,
    props,
    action: (id: string) => context.actions.value.find((action) => action.id === id)!,
  };
};

describe('Screenshot shared Spotlight', () => {
  it('opens the shared palette from the topbar and shortcut, with translated screenshot categories', async () => {
    const f = fixture();
    await flushPromises();
    expect(f.context.ready.value).toBe(true);
    await f.wrapper.get('button[aria-label="Search the editor"]').trigger('click');
    expect(f.context.open.value).toBe(true);
    f.context.open.value = false;
    await flushPromises();
    const key = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
    window.dispatchEvent(key);
    await flushPromises();
    expect(key.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('role')).toBe('combobox');
    await setCurrentLocale('fr');
    expect(f.context.items.value.map((category) => category.label)).toEqual([
      'Ajouter',
      'Calques',
      'Sections',
      'Réglages',
      'Actions',
    ]);
  });

  it('routes the actual screenshot commands and reopens Canvas before focusing background visibility', async () => {
    const f = fixture();
    for (const event of ['copy', 'export', 'crop', 'recenter', 'fullscreen', 'dimensions']) {
      await f.action(`${event === 'dimensions' ? 'setting' : 'action'}:${event}`).run();
      expect(f.search.emitted(event)).toEqual([[]]);
    }
    await f.action('setting:background-visibility').run();
    expect(f.navigate).toHaveBeenCalledWith('canvas');
    expect(focus).toHaveBeenCalledWith('Show Background');
    focus.mockResolvedValueOnce(false);
    await expect(f.action('setting:background-visibility').run()).rejects.toThrow();
  });

  it('keeps unavailable crop and fullscreen commands disabled, reacts to busy state, and releases its commands', async () => {
    const f = fixture();
    Object.assign(f.props, { canCrop: false, canFullscreen: false });
    await flushPromises();
    expect(f.action('action:crop').disabled).toBe(true);
    expect(f.action('action:fullscreen').disabled).toBe(true);
    expect(f.action('action:copy').disabled).toBe(false);
    f.props.disabled = true;
    await flushPromises();
    for (const id of [
      'action:copy',
      'action:export',
      'action:recenter',
      'setting:dimensions',
      'setting:background-visibility',
    ])
      expect(f.action(id).disabled).toBe(true);
    f.wrapper.unmount();
    expect(f.context.ready.value).toBe(false);
    expect(f.context.actions.value.some((action) => action.id === 'action:copy')).toBe(false);
  });
});
