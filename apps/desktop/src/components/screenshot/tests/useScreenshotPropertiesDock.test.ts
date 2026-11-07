import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import type { PreferenceSettings } from '~/api/types/preferences';
import { usePreferencesStore } from '~/stores/preferences';
import { useToastStore } from '~/ui/toast/toastStore';
import { useScreenshotPropertiesDock } from '../useScreenshotPropertiesDock';
import { SCREENSHOT_PROPERTIES_POSITION_KEY } from '../screenshot-properties-position';
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('~/api/capture', () => ({
  capture: { getPreferences: api.get, updatePreferences: api.update, onPreferencesChanged: () => () => {} },
}));
enableAutoUnmount(afterEach);
const settings = (extras: Record<string, unknown> = {}): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'system',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: true, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras,
});
beforeEach(() => {
  setActivePinia(createPinia());
  api.get.mockReset().mockResolvedValue(settings());
  api.update.mockReset().mockImplementation(async (patch) => settings(patch.extras));
});
const create = () => {
  let dock!: ReturnType<typeof useScreenshotPropertiesDock>;
  const wrapper = mount(
    defineComponent({
      setup() {
        dock = useScreenshotPropertiesDock();
        return () => h('div');
      },
    }),
  );
  return { dock, wrapper };
};
it('defaults to the left without requesting preferences again or saving unchanged layout', async () => {
  const { dock } = create();
  expect(dock.position.value).toBe('left');
  await dock.setPosition('left');
  expect(api.get).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
});
it.each(['right', 'floating', 'left'] as const)(
  'persists and restores %s across editor instances',
  async (position) => {
    usePreferencesStore().settings = settings({
      [SCREENSHOT_PROPERTIES_POSITION_KEY]: position === 'left' ? 'right' : 'left',
    });
    const { dock } = create();
    await dock.setPosition(position);
    expect(api.update).toHaveBeenCalledExactlyOnceWith({ extras: { [SCREENSHOT_PROPERTIES_POSITION_KEY]: position } });
    expect(create().dock.position.value).toBe(position);
  },
);
it('synchronizes hydration and preference changes from other windows', async () => {
  const { dock } = create();
  api.get.mockResolvedValue(settings({ [SCREENSHOT_PROPERTIES_POSITION_KEY]: 'floating' }));
  await usePreferencesStore().load();
  await nextTick();
  expect(dock.position.value).toBe('floating');
  await usePreferencesStore().update({ extras: { [SCREENSHOT_PROPERTIES_POSITION_KEY]: 'right' } });
  await nextTick();
  expect(dock.position.value).toBe('right');
});
it('ignores malformed placement flags', async () => {
  const { dock } = create();
  for (const flag of [null, 'unknown', 0, {}, true, false]) {
    usePreferencesStore().settings = settings({ [SCREENSHOT_PROPERTIES_POSITION_KEY]: flag });
    await nextTick();
    expect(dock.position.value).toBe('left');
  }
});
it.each([new Error('disk full'), 'write failure'])(
  'restores the saved placement after a failed write (%s)',
  async (error) => {
    const { dock } = create();
    api.update.mockRejectedValueOnce(error);
    await dock.setPosition('right');
    expect(dock.position.value).toBe('left');
    expect(dock.saving.value).toBe(false);
    expect(useToastStore().toasts.at(-1)?.type).toBe('error');
    await dock.setPosition('floating');
    expect(dock.position.value).toBe('floating');
  },
);
it('blocks concurrent position changes and retains its optimistic placement while saving', async () => {
  const { dock } = create();
  let finish!: (value: unknown) => void;
  api.update.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = dock.setPosition('right');
  expect(dock.position.value).toBe('right');
  expect(dock.saving.value).toBe(true);
  await dock.setPosition('floating');
  expect(api.update).toHaveBeenCalledTimes(1);
  usePreferencesStore().settings = settings({ [SCREENSHOT_PROPERTIES_POSITION_KEY]: 'floating' });
  await nextTick();
  expect(dock.position.value).toBe('right');
  finish(settings({ [SCREENSHOT_PROPERTIES_POSITION_KEY]: 'right' }));
  await task;
  expect(dock.position.value).toBe('right');
  expect(dock.saving.value).toBe(false);
});
