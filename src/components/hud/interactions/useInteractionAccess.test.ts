import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputAccessStatus, PreferenceSettings } from '~/api/types/capture-api';
import { useInteractionAccess } from './useInteractionAccess';

const capture = vi.hoisted(() => ({
  inputAccessStatus: vi.fn(),
  requestInputAccess: vi.fn(),
  updatePreferences: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture }));

const available: InputAccessStatus = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};
const permissionRequired: InputAccessStatus = {
  state: 'permission-required',
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false,
};

const preferences = (enabled: boolean): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'light',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled, noticeDismissed: false },
  alwaysOnTop: true,
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
});

const mountAccess = (platform: string) => {
  let access!: ReturnType<typeof useInteractionAccess>;
  const wrapper = mount(
    defineComponent({
      setup() {
        access = useInteractionAccess(platform);
        return () => h('div');
      },
    }),
  );
  return { access, wrapper };
};

describe('useInteractionAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.inputAccessStatus.mockResolvedValue(permissionRequired);
    capture.requestInputAccess.mockResolvedValue(available);
    capture.updatePreferences.mockResolvedValue(preferences(false));
    Object.defineProperty(window, 'capture', { configurable: true, value: { ...capture, platform: 'linux' } });
  });

  afterEach(() => {
    delete window.capture;
  });

  it('requests Linux input access automatically when the persisted preference is enabled', async () => {
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true));

    await access.refresh();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.status.value).toEqual(available);
    expect(access.enabled.value).toBe(true);
    expect(capture.updatePreferences).toHaveBeenCalledWith({ recordingInteractions: { enabled: true } });
    wrapper.unmount();
  });

  it('does not request Linux input access automatically when the preference is off', async () => {
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(false));

    await access.refresh();

    expect(capture.requestInputAccess).not.toHaveBeenCalled();
    expect(access.status.value).toEqual(permissionRequired);
    expect(access.enabled.value).toBe(false);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not prompt automatically on macOS and disables an enabled preference after revocation', async () => {
    const { access, wrapper } = mountAccess('darwin');
    access.hydrate(preferences(true));

    await access.refresh();

    expect(capture.requestInputAccess).not.toHaveBeenCalled();
    expect(access.status.value).toEqual(permissionRequired);
    expect(access.enabled.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({ recordingInteractions: { enabled: false } });
    wrapper.unmount();
  });

  it('reports a failed automatic Linux request as denied without retrying in a loop', async () => {
    capture.requestInputAccess.mockRejectedValueOnce(new Error('permission denied'));
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true));

    await access.refresh();
    await Promise.resolve();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.status.value.state).toBe('denied');
    expect(access.enabled.value).toBe(true);
    wrapper.unmount();
  });
});
