import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  onPreferencesChanged: vi.fn(() => () => {}),
}));
vi.mock('~/api/capture', () => ({ capture }));
import { useTimelineInsertPreference } from './useTimelineInsertPreference';
import EditorAccessibilitySettings from '../../properties/settings/EditorAccessibilitySettings.vue';
import { usePreferencesStore } from '~/stores/preferences';
enableAutoUnmount(afterEach);
beforeEach(() => {
  setActivePinia(createPinia());
  capture.getPreferences.mockReset().mockResolvedValue({ extras: {} });
  capture.updatePreferences.mockReset();
});
const harness = () => {
  let preference!: ReturnType<typeof useTimelineInsertPreference>;
  mount(
    defineComponent({
      setup() {
        preference = useTimelineInsertPreference();
        return () => h('div');
      },
    }),
  );
  return preference;
};
it('hydrates single-click defaults and keeps keyboard activation', async () => {
  const p = harness();
  await flushPromises();
  expect(p.doubleClick.value).toBe(false);
  expect(p.accepts(new MouseEvent('click', { detail: 1 }))).toBe(true);
  expect(p.accepts(new MouseEvent('click', { detail: 2 }))).toBe(false);
  expect(p.accepts(new MouseEvent('dblclick', { detail: 2 }))).toBe(false);
  expect(p.accepts(new MouseEvent('click', { detail: 0 }))).toBe(true);
});
it('hydrates double-click preference and rejects the two preceding clicks', async () => {
  capture.getPreferences.mockResolvedValue({ extras: { timelineInsertOnDoubleClick: true } });
  const p = harness();
  await flushPromises();
  expect(p.accepts(new MouseEvent('click', { detail: 1 }))).toBe(false);
  expect(p.accepts(new MouseEvent('click', { detail: 2 }))).toBe(false);
  expect(p.accepts(new MouseEvent('dblclick', { detail: 2 }))).toBe(true);
  expect(p.accepts(new MouseEvent('click'))).toBe(true);
});
it('persists changes and receives updates from another settings surface', async () => {
  const p = harness();
  await flushPromises();
  capture.updatePreferences.mockResolvedValue({ extras: { timelineInsertOnDoubleClick: true } });
  await p.setDoubleClick(true);
  expect(capture.updatePreferences).toHaveBeenCalledWith({ extras: { timelineInsertOnDoubleClick: true } });
  expect(p.doubleClick.value).toBe(true);
  usePreferencesStore().settings!.extras.timelineInsertOnDoubleClick = false;
  expect(p.doubleClick.value).toBe(false);
});
it('keeps the previous value on save failure and exposes the error', async () => {
  const p = harness();
  await flushPromises();
  capture.updatePreferences.mockRejectedValue(new Error('disk full'));
  await p.setDoubleClick(true);
  expect(p.doubleClick.value).toBe(false);
  expect(p.error.value).toContain('disk full');
  expect(p.saving.value).toBe(false);
});
it('serializes saves and does not reload an already hydrated preference', async () => {
  const p = harness();
  await flushPromises();
  harness();
  await flushPromises();
  expect(capture.getPreferences).toHaveBeenCalledOnce();
  let resolve!: (value: { extras: Record<string, unknown> }) => void;
  capture.updatePreferences.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = p.setDoubleClick(true);
  await p.setDoubleClick(false);
  expect(capture.updatePreferences).toHaveBeenCalledOnce();
  resolve({ extras: { timelineInsertOnDoubleClick: true } });
  await pending;
});
it('shows a load failure and renders the translated accessibility toggle', async () => {
  capture.getPreferences.mockRejectedValue(new Error('preferences unavailable'));
  const wrapper = mount(EditorAccessibilitySettings);
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('preferences unavailable');
  expect(wrapper.text()).toContain('Accessibility');
  capture.updatePreferences.mockResolvedValue({ extras: { timelineInsertOnDoubleClick: true } });
  await wrapper.get('[role="switch"]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
});
