import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  onUpdateState: vi.fn(() => () => undefined),
  checkForUpdates: vi.fn(),
  openDiscordInvite: vi.fn(),
  openGithubRepository: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import About from './About.vue';

beforeEach(() => {
  vi.clearAllMocks();
  capture.getUpdateState.mockResolvedValue({
    status: 'idle',
    currentVersion: '8.6.4',
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('About', () => {
  it('renders the current version and application description', async () => {
    const wrapper = mount(About);
    await flushPromises();

    expect(wrapper.get('.brand-wordmark').text()).toBe('Beam');
    expect(wrapper.get('.brand-symbol img').attributes('src')).toContain('/brand/BeamIcon.webp');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    expect(wrapper.get('.about-version').text()).toBe('Version 8.6.4');
    expect(wrapper.get('.about-description-title').text()).toBe('Beautiful demos. Thoughtful screenshots.');
    expect(wrapper.get('.about-description').text()).toContain(
      'Record polished product demos, edit and annotate screenshots',
    );
    expect(wrapper.get('.system-info-button').text()).toContain('Copy System Info');
    expect(capture.getUpdateState).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('reports an unavailable version without inventing one when lookup fails', async () => {
    capture.getUpdateState
      .mockResolvedValueOnce({ status: 'idle', currentVersion: '8.6.4' })
      .mockRejectedValueOnce(new Error('update state unavailable'));
    const wrapper = mount(About);
    await flushPromises();
    expect(wrapper.get('.about-version').text()).toBe('Version unavailable');
    expect(wrapper.get('.about-version').text()).not.toContain('0.2.6');
    wrapper.unmount();
  });

  it('shows loading and empty version states, with update and community actions in About', async () => {
    let resolveState!: (value: { currentVersion: string }) => void;
    capture.getUpdateState.mockResolvedValueOnce({ status: 'idle', currentVersion: '8.6.4' }).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveState = resolve;
      }),
    );
    const wrapper = mount(About);
    expect(wrapper.get('.about-version').text()).toBe('Version …');
    resolveState({ currentVersion: '' });
    await flushPromises();
    expect(wrapper.get('.about-version').text()).toBe('Version unavailable');
    const update = wrapper.findAll('.update-actions button').find((button) => button.text() === 'Check for updates')!;
    capture.checkForUpdates.mockResolvedValue({
      status: 'checking',
      currentVersion: '8.6.4',
    });
    await update.trigger('click');
    expect(capture.checkForUpdates).toHaveBeenCalledOnce();
    const discord = wrapper.findAll('.social-links button').find((button) => button.text() === 'Discord')!;
    await discord.trigger('click');
    expect(capture.openDiscordInvite).toHaveBeenCalledOnce();
    await wrapper.get('.about-brand button').trigger('click');
    expect(wrapper.find('.brand-effects').exists()).toBe(true);
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
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
