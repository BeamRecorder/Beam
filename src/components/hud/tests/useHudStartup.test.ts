import { defineComponent, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMock as capture } from './capture.mock';
import { browserCameraMock } from './camera-recorder.mock';
import { browserMicrophoneMock } from './microphone-recorder.mock';
import { useHudState } from '../useHudState';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));
vi.mock('../../../api/camera-recorder', async () => import('./camera-recorder.mock'));
vi.mock('../../../api/microphone-recorder', async () => import('./microphone-recorder.mock'));
vi.mock('../audio/useAudioLevelMeter', () => ({ useAudioLevelMeter: () => ({ level: ref(0) }) }));
vi.mock('../recorder/useNativeSystemAudioPreview', () => ({ useNativeSystemAudioPreview: () => ({ level: ref(0) }) }));

const catalog = {
  sources: [{ id: 'display:1', kind: 'display', label: 'Screen', isDefault: true }],
  capabilities: {},
};
let wrapper: VueWrapper | undefined;
function mountState() {
  let state!: ReturnType<typeof useHudState>;
  wrapper = mount(
    defineComponent({
      setup() {
        state = useHudState(
          {
            embedded: false,
            showTopbar: true,
            preparingEditor: false,
            editorLoadingProgress: { stage: 'openingWindow', value: 10 },
          },
          vi.fn(),
        );
        return () => null;
      },
    }),
  );
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  capture.getPreferences.mockResolvedValue({
    schemaVersion: 3,
    theme: 'dark',
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: true },
    alwaysOnTop: true,
    devices: { cameraId: 'camera:1', micId: 'microphone:1', systemAudioMode: 'on' },
    shortcuts: {},
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  });
  capture.getSources.mockResolvedValue([]);
  capture.discover.mockResolvedValue(catalog);
  browserCameraMock.listBrowserCameras.mockResolvedValue([{ id: 'camera:1', kind: 'camera', label: 'Camera' }]);
  browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([
    { id: 'microphone:1', kind: 'microphone', label: 'Mic' },
  ]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

describe('HUD startup', () => {
  it('restores browser devices and subscribes to controls while native discovery is pending', async () => {
    let resolveCatalog!: (value: typeof catalog) => void;
    capture.discover.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const state = mountState();
    expect(state.isBusy.value).toBe(true);
    await flushPromises();
    expect(state.selectedCameraId.value).toBe('camera:1');
    expect(state.selectedMicId.value).toBe('microphone:1');
    expect(capture.configureCameraOverlay).toHaveBeenLastCalledWith({ cameraId: 'camera:1' });
    expect(capture.onPreferenceShortcut).toHaveBeenCalled();
    expect(state.isBusy.value).toBe(true);
    resolveCatalog(catalog);
    await flushPromises();
    expect(state.selectedScreenId.value).toBe('display:1');
    expect(state.cameraOptions.value.some((option) => option.value === 'camera:1')).toBe(true);
    expect(state.isBusy.value).toBe(false);
    expect(capture.getSources).toHaveBeenCalledExactlyOnceWith(['screen']);
  });

  it('keeps native screen selection available when browser device discovery fails', async () => {
    browserCameraMock.listBrowserCameras.mockRejectedValue(new Error('camera service unavailable'));
    const state = mountState();
    await flushPromises();
    expect(state.selectedScreenId.value).toBe('display:1');
    expect(state.sourceDiscoveryCompleted.value).toBe(true);
    expect(state.isBusy.value).toBe(false);
    expect(state.hudIssues.value.length).toBeGreaterThan(0);
  });

  it('does not start preview refreshes after unmount during discovery', async () => {
    let resolveCatalog!: (value: typeof catalog) => void;
    capture.discover.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    mountState();
    await flushPromises();
    wrapper?.unmount();
    wrapper = undefined;
    resolveCatalog(catalog);
    await flushPromises();
    expect(capture.getSources).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
