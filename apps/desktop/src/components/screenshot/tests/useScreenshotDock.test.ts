import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { usePreferencesStore } from '~/stores/preferences';
import { useToastStore } from '~/ui/toast/toastStore';
import { useScreenshotDock } from '../useScreenshotDock';
import { DEFAULT_DOCK_TOOLS, SCREENSHOT_DOCK_KEY } from '../screenshot-dock-model';

const api = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn() }));
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: api.get, updatePreferences: api.update, onPreferencesChanged: () => () => {} },
}));
enableAutoUnmount(afterEach);
beforeEach(async () => {
  setActivePinia(createPinia());
  api.update.mockReset();
  api.get.mockResolvedValue({ schemaVersion: 3, shortcuts: {}, extras: {} });
  api.update.mockImplementation(async (patch) => ({ schemaVersion: 3, shortcuts: {}, extras: patch.extras }));
  await usePreferencesStore().load();
});
const create = () => {
  let dock!: ReturnType<typeof useScreenshotDock>;
  const wrapper = mount(
    defineComponent({
      setup() {
        dock = useScreenshotDock();
        return () => h('div');
      },
    }),
  );
  return { dock, wrapper };
};

it('persists pinned tools once and restores them in another dock instance', async () => {
  const { dock } = create();
  dock.pin('blur');
  dock.pin('blur');
  await flushPromises();
  expect(api.update).toHaveBeenCalledTimes(1);
  expect(create().dock.pinned.value).toEqual([...DEFAULT_DOCK_TOOLS, 'blur']);
});
it('serializes successive edits without losing tools or temporarily reverting optimistic state', async () => {
  let complete!: (value: unknown) => void;
  api.update.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { dock } = create();
  dock.pin('blur');
  dock.pin('cursor');
  await flushPromises();
  expect(api.update).toHaveBeenCalledTimes(1);
  expect(dock.pinned.value.slice(-2)).toEqual(['blur', 'cursor']);
  complete({ schemaVersion: 3, shortcuts: {}, extras: { [SCREENSHOT_DOCK_KEY]: [...DEFAULT_DOCK_TOOLS, 'blur'] } });
  await flushPromises();
  expect(api.update).toHaveBeenCalledTimes(2);
  expect(dock.pinned.value.slice(-2)).toEqual(['blur', 'cursor']);
});
it('removes tools, resets defaults and synchronizes external preference changes', async () => {
  const { dock } = create();
  dock.remove('arrow');
  await flushPromises();
  expect(dock.pinned.value).not.toContain('arrow');
  dock.reset();
  await flushPromises();
  expect(dock.pinned.value).toEqual(DEFAULT_DOCK_TOOLS);
  usePreferencesStore().settings!.extras[SCREENSHOT_DOCK_KEY] = ['zoom'];
  await flushPromises();
  expect(dock.pinned.value).toEqual(['zoom']);
});
it('reports save failure and restores the actual persisted preference', async () => {
  api.update.mockRejectedValueOnce(new Error('Disk full'));
  const { dock } = create();
  dock.pin('blur');
  expect(dock.pinned.value).toContain('blur');
  await flushPromises();
  expect(dock.pinned.value).toEqual(DEFAULT_DOCK_TOOLS);
  expect(useToastStore().toasts.at(-1)?.message).toContain('Disk full');
});
it('finishes saving after the dock unmounts without retaining UI observers', async () => {
  const { dock, wrapper } = create();
  dock.pin('highlight');
  wrapper.unmount();
  await flushPromises();
  expect(usePreferencesStore().settings!.extras[SCREENSHOT_DOCK_KEY]).toContain('highlight');
});
it('persists reordered tools and skips unchanged insertion positions', async () => {
  const { dock } = create();
  dock.reorder('shape', 0);
  await flushPromises();
  expect(create().dock.pinned.value.slice(0, 3)).toEqual(['shape', 'arrow', 'text']);
  dock.reorder('shape', 0);
  dock.reorder('shape', 1);
  dock.reorder('blur', 0);
  await flushPromises();
  expect(api.update).toHaveBeenCalledTimes(1);
});
it('serializes reordering with subsequent pin and remove operations', async () => {
  const { dock } = create();
  dock.reorder('image', 0);
  dock.pin('blur');
  dock.remove('text');
  await flushPromises();
  expect(create().dock.pinned.value).toEqual(['image', 'arrow', 'shape', 'drawing', 'canvas', 'blur']);
});
it('restores the saved order when reordering cannot be persisted', async () => {
  api.update.mockRejectedValueOnce(new Error('Read only'));
  const { dock } = create();
  dock.reorder('shape', 0);
  await flushPromises();
  expect(dock.pinned.value).toEqual(DEFAULT_DOCK_TOOLS);
  expect(useToastStore().toasts.at(-1)?.message).toContain('Read only');
});
