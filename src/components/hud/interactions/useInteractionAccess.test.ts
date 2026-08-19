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
const installationRequired: InputAccessStatus = {
  state: 'installation-required',
  canRequest: true,
  clicks: false,
  shortcuts: false,
  recordsText: false,
};

const preferences = (enabled: boolean, noticeDismissed = false): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'light',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled, noticeDismissed },
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

  it('automatically requests Linux input access after persisted consent and keeps consent during the attempt', async () => {
    let resolveRequest!: (value: InputAccessStatus) => void;
    capture.requestInputAccess.mockImplementationOnce(
      () => new Promise<InputAccessStatus>((resolve) => (resolveRequest = resolve)),
    );
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true, true));

    const refresh = access.refresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.status.value).toEqual(permissionRequired);
    expect(access.enabled.value).toBe(true);
    expect(access.noticeDismissed.value).toBe(true);
    expect(capture.updatePreferences).not.toHaveBeenCalled();

    resolveRequest(available);
    await refresh;

    expect(access.status.value).toEqual(available);
    expect(access.enabled.value).toBe(true);
    expect(access.recordingEnabled.value).toBe(true);
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      recordingInteractions: { enabled: true, noticeDismissed: true },
    });
    wrapper.unmount();
  });

  it('hydrates the persisted interaction notice state', () => {
    const { access, wrapper } = mountAccess('linux');

    access.hydrate(preferences(false, true));

    expect(access.noticeDismissed.value).toBe(true);
    wrapper.unmount();
  });

  it('does not request Linux input access automatically when the preference is off', async () => {
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(false));

    await access.refresh();

    expect(capture.requestInputAccess).not.toHaveBeenCalled();
    expect(access.status.value).toEqual(permissionRequired);
    expect(access.enabled.value).toBe(false);
    expect(access.recordingEnabled.value).toBe(false);
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('waits for an explicit click when the Linux helper must be installed or updated', async () => {
    capture.inputAccessStatus.mockResolvedValueOnce(installationRequired);
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true, true));

    await access.refresh();

    expect(capture.requestInputAccess).not.toHaveBeenCalled();
    expect(access.status.value).toEqual(installationRequired);
    expect(access.enabled.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({ recordingInteractions: { enabled: false } });
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

  it('persists disabled interactions after an explicitly denied Linux request', async () => {
    capture.requestInputAccess.mockRejectedValueOnce(new Error('permission denied'));
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true));

    await access.request();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.status.value.state).toBe('denied');
    expect(access.status.value.canRequest).toBe(true);
    expect(access.enabled.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      recordingInteractions: { enabled: false, noticeDismissed: false },
    });
    expect(access.recordingEnabled.value).toBe(false);
    wrapper.unmount();
  });

  it('surfaces a failed automatic request as retryable access', async () => {
    capture.requestInputAccess.mockRejectedValueOnce(new Error('permission denied'));
    const { access, wrapper } = mountAccess('linux');
    access.hydrate(preferences(true, true));

    await access.refresh();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.status.value.state).toBe('denied');
    expect(access.status.value.canRequest).toBe(true);
    expect(access.recordingEnabled.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      recordingInteractions: { enabled: false, noticeDismissed: false },
    });
    wrapper.unmount();
  });

  it('allows a denied Linux request to be retried explicitly and enabled after success', async () => {
    capture.requestInputAccess.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce(available);
    const { access, wrapper } = mountAccess('linux');

    await access.request();
    expect(access.status.value.state).toBe('denied');
    expect(access.enabled.value).toBe(false);

    await access.request();

    expect(capture.requestInputAccess).toHaveBeenCalledTimes(2);
    expect(access.status.value).toEqual(available);
    expect(access.enabled.value).toBe(true);
    expect(access.recordingEnabled.value).toBe(true);
    expect(capture.updatePreferences).toHaveBeenNthCalledWith(1, {
      recordingInteractions: { enabled: false, noticeDismissed: false },
    });
    expect(capture.updatePreferences).toHaveBeenNthCalledWith(2, {
      recordingInteractions: { enabled: true, noticeDismissed: true },
    });
    wrapper.unmount();
  });

  it('persists a successful explicit authorization as enabled and notice dismissed', async () => {
    const { access, wrapper } = mountAccess('linux');

    await access.request();

    expect(access.noticeDismissed.value).toBe(true);
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      recordingInteractions: { enabled: true, noticeDismissed: true },
    });
    wrapper.unmount();
  });

  it('keeps the interaction notice visible after an explicit refusal', async () => {
    capture.requestInputAccess.mockRejectedValueOnce(new Error('permission denied'));
    const { access, wrapper } = mountAccess('linux');

    await access.request();

    expect(access.noticeDismissed.value).toBe(false);
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      recordingInteractions: { enabled: false, noticeDismissed: false },
    });
    wrapper.unmount();
  });

  it('ignores concurrent Linux authorization requests while one Polkit prompt is pending', async () => {
    let resolveRequest!: (value: InputAccessStatus) => void;
    capture.requestInputAccess.mockImplementationOnce(
      () => new Promise<InputAccessStatus>((resolve) => (resolveRequest = resolve)),
    );
    const { access, wrapper } = mountAccess('linux');

    const first = access.request();
    const second = access.request();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(access.requesting.value).toBe(true);
    resolveRequest(available);
    await first;
    await second;

    expect(access.status.value).toEqual(available);
    expect(access.requesting.value).toBe(false);
    wrapper.unmount();
  });

  it('keeps native authorization available when preference persistence fails', async () => {
    capture.updatePreferences.mockRejectedValueOnce(new Error('preferences unavailable'));
    const { access, wrapper } = mountAccess('linux');

    await expect(access.request()).resolves.toBeUndefined();

    expect(access.status.value).toEqual(available);
    expect(access.enabled.value).toBe(true);
    expect(access.recordingEnabled.value).toBe(true);
    expect(access.requesting.value).toBe(false);
    wrapper.unmount();
  });
});
