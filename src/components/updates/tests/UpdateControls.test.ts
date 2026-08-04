import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateControls from './UpdateControls.vue';
import type { AppUpdateState } from '~/api/types/capture-api';

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
  props: ['disabled'],
  emits: ['click'],
  template:
    '<button class="action-button" :disabled="disabled" @click="$emit(\'click\')"><slot name="icon" /><slot /></button>',
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
    expect(wrapper.get('.update-description').text()).toContain('1.0.0');
    const buttons = wrapper.findAll('.action-button');
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
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
    await available.findAll('.action-button')[1]!.trigger('click');
    expect(captureMock.downloadUpdate).toHaveBeenCalledOnce();

    captureMock.getUpdateState.mockResolvedValue(state('downloaded'));
    const downloaded = mount(UpdateControls, { global: { stubs: { Button } } });
    await flushPromises();
    await downloaded.findAll('.action-button')[1]!.trigger('click');
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
        expect(wrapper.get('.error-log').text()).toContain(current.message!);
      }
      if (current.status === 'checking' || current.status === 'downloading' || current.status === 'unsupported') {
        expect(wrapper.findAll('.action-button')[1]!.attributes('disabled')).toBeDefined();
      }
      wrapper.unmount();
    }
  });
});
