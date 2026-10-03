import { mount, enableAutoUnmount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SidebarPanel from '../../sidebar/SidebarPanel.vue';
import { provideEditorSearch } from '../useEditorSearch';
import type { EditorSearchContext } from '../editor-search-types';
vi.mock('~/api/capture', () => ({ capture: {} }));
enableAutoUnmount(afterEach);
describe('Spotlight sidebar navigation', () => {
  it('keeps an already-open Clip panel open when selecting a property in the same tab', async () => {
    let search!: EditorSearchContext;
    const wrapper = mount(
      defineComponent({
        setup() {
          search = provideEditorSearch({
            mode: 'video',
            canInsert: () => true,
            canEditClip: () => true,
            clipKind: () => undefined,
            insert: () => {},
            selections: () => [],
          });
          return () => h(SidebarPanel, { activeTab: 'clip', panelOpen: true });
        },
      }),
      { global: { stubs: { UpdateAvailableBadge: true } } },
    );
    await search.navigate('clip');
    expect(wrapper.findComponent(SidebarPanel).emitted('select-tab')).toBeUndefined();
  });
  it('opens Clip when its panel has been closed', async () => {
    let search!: EditorSearchContext;
    const open = ref(false);
    const wrapper = mount(
      defineComponent({
        setup() {
          search = provideEditorSearch({
            mode: 'video',
            canInsert: () => true,
            canEditClip: () => true,
            clipKind: () => undefined,
            insert: () => {},
            selections: () => [],
          });
          return () =>
            h(SidebarPanel, {
              activeTab: 'clip',
              panelOpen: open.value,
              onSelectTab: () => {
                open.value = true;
              },
            });
        },
      }),
      { global: { stubs: { UpdateAvailableBadge: true } } },
    );
    await search.navigate('clip');
    await nextTick();
    expect(open.value).toBe(true);
    expect(wrapper.findComponent(SidebarPanel).emitted('select-tab')).toEqual([['clip']]);
  });
  it('routes a different tab without toggling it closed on the next request', async () => {
    let search!: EditorSearchContext;
    const active = ref('canvas');
    const wrapper = mount(
      defineComponent({
        setup() {
          search = provideEditorSearch({
            mode: 'screenshot',
            canInsert: () => true,
            canEditClip: () => true,
            clipKind: () => undefined,
            insert: () => {},
            selections: () => [],
          });
          return () =>
            h(SidebarPanel, {
              activeTab: active.value,
              onSelectTab: (tab: string) => {
                active.value = tab;
              },
            });
        },
      }),
      { global: { stubs: { UpdateAvailableBadge: true } } },
    );
    await search.navigate('clip');
    await search.navigate('clip');
    expect(active.value).toBe('clip');
    expect(wrapper.findComponent(SidebarPanel).emitted('select-tab')).toEqual([['clip']]);
  });
});
