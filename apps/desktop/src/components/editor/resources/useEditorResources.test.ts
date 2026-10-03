import { defineComponent, effectScope, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import { useEditorResources } from './useEditorResources';
import type { EditorResources } from './editor-resource-types';
vi.mock('~/api/capture', () => ({ capture: {} }));
it('retains one resource owner while replacing Screenshot and Video children', async () => {
  let owner!: EditorResources;
  const children: EditorResources[] = [];
  const kind = ref('screenshot');
  const Child = defineComponent({
    setup() {
      children.push(useEditorResources());
      return () => null;
    },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        owner = useEditorResources();
        return () => h(Child, { key: kind.value });
      },
    }),
  );
  expect(children[0]).toBe(owner);
  kind.value = 'video';
  await wrapper.vm.$nextTick();
  expect(children).toEqual([owner, owner]);
  expect(() =>
    owner.rememberPresets('video', { schemaVersion: 1, activePresetId: 'default', presets: [] }),
  ).not.toThrow();
  wrapper.unmount();
  expect(() => owner.backgrounds()).toThrow('disposed');
});
it('isolates independent windows and disposes their owners separately', () => {
  const owners: EditorResources[] = [];
  const Window = defineComponent({
    setup() {
      owners.push(useEditorResources());
      return () => null;
    },
  });
  const first = mount(Window),
    second = mount(Window);
  expect(owners[0]).not.toBe(owners[1]);
  first.unmount();
  expect(() => owners[0]!.cursors()).toThrow('disposed');
  expect(() =>
    owners[1]!.rememberPresets('video', { schemaVersion: 1, activePresetId: 'default', presets: [] }),
  ).not.toThrow();
  second.unmount();
});
it('supports composables in an effect scope without a Vue component', () => {
  const scope = effectScope();
  const resources = scope.run(useEditorResources)!;
  scope.stop();
  expect(() => resources.backgrounds()).toThrow('disposed');
});
it('lets a caller explicitly own resources outside a Vue scope', () => {
  const resources = useEditorResources();
  resources.rememberPresets('video', { schemaVersion: 1, activePresetId: 'default', presets: [] });
  resources.dispose();
  expect(() => resources.cursors()).toThrow('disposed');
});
