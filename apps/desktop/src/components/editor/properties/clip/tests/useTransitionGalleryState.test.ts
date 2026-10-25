import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TransitionGalleryStateModule from '../useTransitionGalleryState';
import type { PreferencePatch } from '~/api/types/capture-api';

const preferences = vi.hoisted(() => ({
  settings: { extras: {} as Record<string, unknown> },
  update: vi.fn(),
}));
vi.mock('~/stores/preferences', () => ({ usePreferencesStore: () => preferences }));

const key = 'editor.transitionCategory';
const categories = ['basics', 'zooms', 'panels', 'shapes', 'color', 'dynamic', 'digital'];
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.resetModules();
  preferences.settings = reactive({ extras: { unrelated: 'preserve' } as Record<string, unknown> });
  preferences.update.mockReset().mockImplementation(async (patch: PreferencePatch) => {
    Object.assign(preferences.settings.extras, patch.extras);
    return preferences.settings;
  });
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

async function mountState() {
  const { useTransitionGalleryState } = await import('../useTransitionGalleryState');
  let state!: ReturnType<typeof TransitionGalleryStateModule.useTransitionGalleryState>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useTransitionGalleryState();
        return () => null;
      },
    }),
  );
  wrappers.push(wrapper);
  await flushPromises();
  return { state, wrapper };
}

describe('transition gallery category memory', () => {
  it('starts with Basics without writing preferences when no category was saved', async () => {
    const { state } = await mountState();
    expect(state.category.value).toBe('basics');
    expect(preferences.update).not.toHaveBeenCalled();
  });

  it.each(categories)('restores the saved %s category without applying any transition', async (category) => {
    preferences.settings.extras[key] = category;
    const { state } = await mountState();
    expect(state.category.value).toBe(category);
    expect(preferences.update).not.toHaveBeenCalled();
  });

  it('restores an explicitly collapsed gallery instead of forcing a category open', async () => {
    preferences.settings.extras[key] = null;
    const { state } = await mountState();
    expect(state.category.value).toBeNull();
    expect(preferences.update).not.toHaveBeenCalled();
  });

  it.each(['removed-category', '', 5, false, {}, ['zooms']])('rejects malformed saved category %j', async (value) => {
    preferences.settings.extras[key] = value;
    const { state } = await mountState();
    expect(state.category.value).toBe('basics');
    expect(preferences.update).not.toHaveBeenCalled();
  });

  it('stores the last opened category and restores it when the transition inspector remounts', async () => {
    const first = await mountState();
    first.state.setCategory('digital');
    expect(first.state.category.value).toBe('digital');
    await flushPromises();
    expect(preferences.update).toHaveBeenCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({ [key]: 'digital' }),
      }),
    );
    expect(preferences.settings.extras.unrelated).toBe('preserve');
    first.wrapper.unmount();
    const second = await mountState();
    expect(second.state.category.value).toBe('digital');
  });

  it('remembers an entirely collapsed gallery across remounts', async () => {
    const first = await mountState();
    first.state.setCategory('zooms');
    first.state.setCategory(null);
    await flushPromises();
    expect(first.state.category.value).toBeNull();
    expect(preferences.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({ [key]: null }),
      }),
    );
    first.wrapper.unmount();
    expect((await mountState()).state.category.value).toBeNull();
  });

  it('ignores unsupported or unchanged category requests without overwriting saved preferences', async () => {
    const { state } = await mountState();
    state.setCategory('unknown-category');
    state.setCategory('basics');
    await flushPromises();
    expect(state.category.value).toBe('basics');
    expect(preferences.update).not.toHaveBeenCalled();
  });

  it('hydrates valid late preferences and follows confirmed changes once navigation has finished saving', async () => {
    const { state } = await mountState();
    preferences.settings.extras[key] = 'removed-category';
    await flushPromises();
    expect(state.category.value).toBe('basics');
    preferences.settings.extras[key] = 'color';
    await flushPromises();
    expect(state.category.value).toBe('color');
    state.setCategory('digital');
    await flushPromises();
    preferences.settings.extras[key] = 'zooms';
    await flushPromises();
    expect(state.category.value).toBe('zooms');
  });

  it('keeps navigation responsive and reports a failed preference write', async () => {
    const error = new Error('Preferences unavailable');
    preferences.update.mockRejectedValueOnce(error);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { state } = await mountState();
    state.setCategory('shapes');
    await flushPromises();
    expect(state.category.value).toBe('shapes');
    expect(report).toHaveBeenCalledWith(expect.any(String), error);
  });

  it('serializes preference writes across panel remounts without reverting to an older category', async () => {
    let finishFirst!: () => void;
    preferences.update.mockImplementationOnce(
      (patch: PreferencePatch) =>
        new Promise((resolve) => {
          finishFirst = () => {
            Object.assign(preferences.settings.extras, patch.extras);
            resolve(preferences.settings);
          };
        }),
    );
    const first = await mountState();
    first.state.setCategory('zooms');
    await flushPromises();
    expect(preferences.update).toHaveBeenCalledTimes(1);
    first.wrapper.unmount();
    const next = await mountState();
    next.state.setCategory('digital');
    await flushPromises();
    expect(next.state.category.value).toBe('digital');
    expect(preferences.update).toHaveBeenCalledTimes(1);
    finishFirst();
    await flushPromises();
    expect(preferences.update).toHaveBeenCalledTimes(2);
    expect(preferences.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({ [key]: 'digital' }),
      }),
    );
    expect(preferences.settings.extras[key]).toBe('digital');
    expect(next.state.category.value).toBe('digital');
    const reopened = await mountState();
    expect(reopened.state.category.value).toBe('digital');
  });
});
