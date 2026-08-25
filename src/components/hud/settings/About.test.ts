import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import About from './About.vue';

beforeEach(() => {
  vi.clearAllMocks();
  capture.getUpdateState.mockResolvedValue({ currentVersion: '8.6.4' });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('About', () => {
  it('renders the current version and application description', async () => {
    const wrapper = mount(About);
    await flushPromises();

    expect(wrapper.get('.about-name').text()).toBe('Beam');
    expect(wrapper.get('.about-version').text()).toBe('Version 8.6.4');
    expect(wrapper.get('.about-description-title').text()).toBe('Beam is a screen recorder and editor.');
    expect(wrapper.findAll('.about-description')[1]!.text()).toContain('Record, style, annotate, and export.');
    expect(wrapper.get('.system-info-button').text()).toContain('Copy System Info');
    expect(capture.getUpdateState).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('keeps the default version when the update state lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    capture.getUpdateState.mockRejectedValueOnce(new Error('update state unavailable'));
    const wrapper = mount(About);
    await flushPromises();

    expect(wrapper.get('.about-version').text()).toBe('Version 0.2.5');
    expect(consoleError).toHaveBeenCalledWith('Failed to resolve current app version:', expect.any(Error));
    consoleError.mockRestore();
    wrapper.unmount();
  });

  it('copies system information and shows the copied state on the About button', async () => {
    const wrapper = mount(About);
    await flushPromises();

    await wrapper.get('.system-info-button').trigger('click');
    await flushPromises();

    const writeText = (navigator.clipboard as unknown as { writeText: ReturnType<typeof vi.fn> }).writeText;
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('App Version: 8.6.4'));
    expect(wrapper.get('.system-info-button').text()).toContain('Copied!');
    expect(wrapper.get('.system-info-button .icon-check, .system-info-button svg')).not.toBeNull();
    wrapper.unmount();
  });
});
