import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import { provideEditorSearch } from '../useEditorSearch';
import type { EditorSearchContext, EditorSearchOptions } from '../editor-search-types';
const focus = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../focus-editor-property', () => ({ focusEditorProperty: focus }));
enableAutoUnmount(afterEach);
afterEach(() => focus.mockReset().mockResolvedValue(true));
const harness = (overrides: Partial<EditorSearchOptions> = {}) => {
  let context!: EditorSearchContext;
  const enabled = ref(true),
    kind = ref<string | undefined>('image');
  const insert = vi.fn(),
    visible = vi.fn(),
    select = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        context = provideEditorSearch({
          mode: 'video',
          canInsert: () => enabled.value,
          canEditClip: () => enabled.value,
          canEditZoom: () => enabled.value,
          clipKind: () => kind.value,
          insert,
          visible,
          selections: () => [
            { id: 'clip:c', label: 'My clip', group: 'selection', run: select },
            { id: 'zoom:z', label: 'My zoom', group: 'selection', run: select },
            {
              id: 'clip:background',
              label: 'Backdrop',
              group: 'selection',
              tab: 'canvas',
              run: select,
            },
          ],
          ...overrides,
        });
        return () => h('div');
      },
    }),
  );
  return {
    context,
    wrapper,
    enabled,
    kind,
    insert,
    visible,
    select,
    action: (id: string) => context.actions.value.find((item) => item.id === id)!,
  };
};
describe('shared editor search provider', () => {
  it('groups live commands into Add, Clips, Sections, Settings and Actions and disables unavailable edits', () => {
    const f = harness();
    expect(f.context.items.value.map((item) => item.id)).toEqual([
      'category:insert',
      'category:selection',
      'category:navigation',
      'category:setting',
      'category:action',
    ]);
    expect(f.context.items.value[1]!.children).toHaveLength(3);
    expect(f.action('insert:image').disabled).toBe(false);
    f.enabled.value = false;
    expect(f.action('insert:image').disabled).toBe(true);
    expect(f.action('setting:ClipPropertiesPanel.cornerRadius').disabled).toBe(true);
    expect(f.action('setting:ZoomPanel.mode').disabled).toBe(true);
    f.kind.value = 'audio';
    expect(f.context.actions.value.some((item) => item.id === 'setting:AudioClipPropertiesPanel.volume')).toBe(true);
    expect(f.context.actions.value.some((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')).toBe(false);
  });
  it('navigates before editing or selecting and handles settings becoming unavailable', async () => {
    const f = harness(),
      navigate = vi.fn();
    f.context.setNavigator(navigate);
    await f.action('navigate:canvas').run();
    expect(navigate).toHaveBeenLastCalledWith('canvas');
    await f.action('insert:text').run();
    expect(navigate).toHaveBeenLastCalledWith('clip');
    expect(f.insert).toHaveBeenCalledWith('text');
    for (const [id, tab] of [
      ['clip:c', 'clip'],
      ['zoom:z', 'zoom'],
      ['clip:background', 'canvas'],
    ]) {
      await f.action(id!).run();
      expect(navigate).toHaveBeenLastCalledWith(tab);
    }
    await f.action('setting:ClipPropertiesPanel.cornerRadius').run();
    expect(focus).toHaveBeenCalled();
    focus.mockResolvedValueOnce(false);
    await expect(f.action('setting:ClipPropertiesPanel.cornerRadius').run()).rejects.toThrow();
    expect(f.select).toHaveBeenCalledTimes(3);
  });
  it('tracks navigator ownership, command registration and visible thumbnail requests across opening and closing', async () => {
    const f = harness();
    await expect(f.context.navigate('canvas')).rejects.toThrow();
    const releaseOld = f.context.setNavigator(vi.fn()),
      newer = vi.fn();
    const release = f.context.setNavigator(newer);
    releaseOld();
    expect(f.context.ready.value).toBe(true);
    await f.context.navigate('clip');
    expect(newer).toHaveBeenCalledWith('clip');
    release();
    expect(f.context.ready.value).toBe(false);
    await expect(f.context.navigate('clip')).rejects.toThrow();
    const remove = f.context.registerActions(() => [
      {
        id: 'insert:voiceover',
        group: 'insert',
        label: 'Voiceover',
        run: vi.fn(),
      },
    ]);
    expect(f.action('insert:voiceover')).toBeDefined();
    f.enabled.value = false;
    expect(f.action('insert:voiceover').disabled).toBe(true);
    remove();
    expect(f.action('insert:voiceover')).toBeUndefined();
    f.context.setVisibleActions(['clip:c']);
    expect(f.visible).toHaveBeenLastCalledWith([]);
    f.context.open.value = true;
    f.context.setVisibleActions(['clip:c']);
    expect(f.visible).toHaveBeenLastCalledWith(['clip:c']);
  });
  it('limits Screenshot to supported sections and additions while translating the shared UI reactively', async () => {
    const f = harness({
      mode: 'screenshot',
      visible: undefined,
      canEditZoom: undefined,
    });
    expect(f.context.actions.value.filter((item) => item.group === 'navigation').map((item) => item.id)).toEqual([
      'navigate:canvas',
      'navigate:clip',
      'navigate:settings',
    ]);
    expect(f.context.actions.value.some((item) => item.id === 'insert:cursor')).toBe(true);
    expect(f.context.actions.value.some((item) => item.id === 'insert:color')).toBe(false);
    expect(f.context.actions.value.some((item) => item.id.startsWith('setting:ZoomPanel'))).toBe(false);
    f.context.setVisibleActions([]);
    await setCurrentLocale('fr');
    await flushPromises();
    expect(f.context.items.value[0]!.label).toBe('Ajouter');
  });
  it('indexes properties for shape, caption, blur and color without unrelated audio controls', () => {
    const f = harness();
    for (const value of ['shape', 'caption', 'blur', 'color', undefined]) {
      f.kind.value = value;
      expect(f.context.actions.value.filter((item) => item.group === 'setting').length).toBeGreaterThan(0);
    }
  });
});
