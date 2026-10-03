import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateControls from '../UpdateControls.vue';
import type { AppUpdateState } from '~/api/types/capture-api';
import { setCurrentLocale } from '~/i18n';
enableAutoUnmount(afterEach);

const captureMock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstallUpdate: vi.fn(),
  openUpdateChangelog: vi.fn(),
  onUpdateState: vi.fn(),
  listener: undefined as ((state: AppUpdateState) => void) | undefined,
  stopListening: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: captureMock }));

const Button = {
  props: ['disabled', 'tooltip'],
  emits: ['click'],
  template:
    '<button class="action-button" :disabled="disabled" :data-tooltip="tooltip" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
};

const state = (status: AppUpdateState['status'], overrides: Partial<AppUpdateState> = {}): AppUpdateState => ({
  status,
  currentVersion: '1.0.0',
  availableVersion: '1.1.0',
  percent: 42,
  message: 'Update failed',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  captureMock.getUpdateState.mockReset();
  captureMock.checkForUpdates.mockReset();
  captureMock.downloadUpdate.mockReset();
  captureMock.quitAndInstallUpdate.mockReset();
  captureMock.openUpdateChangelog.mockReset();
  captureMock.onUpdateState.mockReset();
  captureMock.listener = undefined;
  captureMock.stopListening = vi.fn();
  captureMock.onUpdateState.mockImplementation((listener: (next: AppUpdateState) => void) => {
    captureMock.listener = listener;
    return captureMock.stopListening;
  });
  captureMock.checkForUpdates.mockResolvedValue(state('checking'));
  captureMock.downloadUpdate.mockResolvedValue(true);
  captureMock.quitAndInstallUpdate.mockResolvedValue(true);
  captureMock.openUpdateChangelog.mockResolvedValue(undefined);
});

describe('UpdateControls', () => {
  it('renders the default state, refreshes, opens the changelog and follows native updates', async () => {
    captureMock.getUpdateState.mockResolvedValue(state('idle', { availableVersion: null }));
    const wrapper = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    expect(wrapper.get('.update-version').text()).toBe('v1.0.0');
    expect(wrapper.get('.update-description').text()).toContain('1.0.0');
    const buttons = wrapper.findAll('.action-button');
    await buttons[1]!.trigger('click');
    await buttons[0]!.trigger('click');
    expect(captureMock.openUpdateChangelog).toHaveBeenCalledOnce();
    expect(captureMock.checkForUpdates).toHaveBeenCalledOnce();

    captureMock.listener?.(state('not-available', { currentVersion: '1.2.0' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.update-description').text()).toContain('1.2.0');
    wrapper.unmount();
    expect(captureMock.stopListening).toHaveBeenCalledOnce();
  });

  it('downloads available updates and restarts downloaded ones', async () => {
    captureMock.getUpdateState.mockResolvedValue(state('available'));
    const available = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    expect(available.get('.update-description').text()).toContain('1.1.0');
    await available.get('.update-actions .action-button:not(.changelog-btn)').trigger('click');
    expect(captureMock.downloadUpdate).toHaveBeenCalledOnce();

    captureMock.getUpdateState.mockResolvedValue(state('downloaded'));
    const downloaded = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    await downloaded.get('.update-actions .action-button:not(.changelog-btn)').trigger('click');
    expect(captureMock.quitAndInstallUpdate).toHaveBeenCalledOnce();
    available.unmount();
    downloaded.unmount();
  });

  it('describes all transient and failure states and disables unavailable actions', async () => {
    for (const current of [state('checking'), state('downloading'), state('error'), state('unsupported')]) {
      captureMock.getUpdateState.mockResolvedValueOnce(current);
      const wrapper = mount(UpdateControls, { global: { stubs: { Button } } });
      await flushPromises();
      if (current.status === 'error') {
        expect(wrapper.find('.error-copy').exists()).toBe(true);
      }
      if (current.status === 'checking' || current.status === 'downloading' || current.status === 'unsupported') {
        const actionBtn = wrapper.get('.update-actions .action-button:not(.changelog-btn)');
        expect(actionBtn.attributes('disabled')).toBeDefined();
        expect(actionBtn.attributes('data-tooltip')).toBeTruthy();
      }
      wrapper.unmount();
    }
  });

  it('keeps compact actions together with short translated labels and a full accessible changelog name', async () => {
    await setCurrentLocale('fr');
    captureMock.getUpdateState.mockResolvedValue(state('idle'));
    const wrapper = mount(UpdateControls, {
      props: { compact: true },
      global: { stubs: { Button } },
    });
    await flushPromises();
    expect(wrapper.classes()).toContain('update-compact');
    expect(wrapper.find('.update-description').exists()).toBe(false);
    expect(wrapper.findAll('.update-actions button').map((button) => button.text())).toEqual(['Vérifier', 'Changelog']);
    expect(wrapper.get('.changelog-btn').attributes('aria-label')).toBe('Voir le changelog');
    await wrapper.get('.changelog-btn').trigger('click');
    expect(captureMock.openUpdateChangelog).toHaveBeenCalledOnce();
  });

  it('keeps initial actions disabled and exposes status icons and missing-value descriptions', async () => {
    let resolve!: (value: AppUpdateState) => void;
    captureMock.getUpdateState.mockReturnValue(
      new Promise<AppUpdateState>((done) => {
        resolve = done;
      }),
    );
    const wrapper = mount(UpdateControls, {
      props: { showIcon: true, center: true },
      global: { stubs: { Button } },
    });
    expect(wrapper.get('.update-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.changelog-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.update-description').text()).toContain('…');
    resolve(state('checking'));
    await flushPromises();
    expect(wrapper.get('.update-top-icon').classes()).toContain('icon-spin');
    captureMock.listener?.(state('downloading', { percent: null }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.update-description').text()).toContain('0');
    captureMock.listener?.(state('available', { availableVersion: null }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.update-description').text()).toContain('…');
  });

  it('copies errors and resets feedback, including a repeated copy and unmount', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    captureMock.getUpdateState.mockResolvedValue(state('error'));
    const wrapper = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    await wrapper.get('.error-copy').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('Update failed');
    expect(wrapper.get('.error-copy').text()).toContain('Copied');
    await wrapper.get('.error-copy').trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.get('.error-copy').text()).toContain('Copy error');
    await wrapper.get('.error-copy').trigger('click');
    await flushPromises();
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('copies through the native text command when clipboard access fails and cleans up the textarea', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    captureMock.getUpdateState.mockResolvedValue(state('error'));
    const wrapper = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    await wrapper.get('.error-copy').trigger('click');
    await flushPromises();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(wrapper.get('.error-copy').text()).toContain('Copied');
  });
});
