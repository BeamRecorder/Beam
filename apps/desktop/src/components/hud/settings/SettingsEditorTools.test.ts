import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsEditorTools from './SettingsEditorTools.vue';
const capture = vi.hoisted(() => ({ getSettingsEditorContext: vi.fn(), runSettingsEditorAction: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture }));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.clearAllMocks();
  capture.getSettingsEditorContext.mockResolvedValue({ projectId: 'p' });
  capture.runSettingsEditorAction.mockResolvedValue(undefined);
});
describe('development tools for the Settings owner', () => {
  it.each([null, { projectId: 'p', kind: 'screenshot' }])('does not show video-only tools for %s', async (context) => {
    capture.getSettingsEditorContext.mockResolvedValue(context);
    const w = mount(SettingsEditorTools);
    await flushPromises();
    expect(w.findAll('button')).toHaveLength(0);
  });
  it('relays each tool to the live editor owner', async () => {
    const w = mount(SettingsEditorTools);
    await flushPromises();
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(3);
    for (let i = 0; i < buttons.length; i++) {
      await buttons[i]!.trigger('click');
      await flushPromises();
      expect(capture.runSettingsEditorAction).toHaveBeenLastCalledWith(['recorder', 'webcam', 'devtools'][i]);
    }
  });
  it('blocks repeated actions during a request and reports failures', async () => {
    let reject!: (error: unknown) => void;
    capture.runSettingsEditorAction.mockImplementationOnce(() => new Promise((_, fail) => (reject = fail)));
    const w = mount(SettingsEditorTools);
    await flushPromises();
    await w.get('button').trigger('click');
    expect(w.findAll('button').every((button) => button.element.disabled)).toBe(true);
    reject(new Error('Editor unavailable'));
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe('Editor unavailable');
    expect(w.get('button').element.disabled).toBe(false);
  });
  it('reports context lookup failures', async () => {
    capture.getSettingsEditorContext.mockRejectedValueOnce(new Error('Settings unavailable'));
    const w = mount(SettingsEditorTools);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Settings unavailable');
    expect(w.findAll('button')).toHaveLength(0);
  });
});
