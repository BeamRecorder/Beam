import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { ScreenRegion } from '~/api/types/screen-region';
import type { RecordingConfiguration } from '../recorder/recording-types';

const captureMock = vi.hoisted(() => ({
  onPreferencesChanged: vi.fn(),
  updatePreferences: vi.fn(),
  setCameraOverlayActive: vi.fn(),
  hideTeleprompter: vi.fn(),
  quickSnipFromHud: vi.fn(),
  setWindowVisible: vi.fn(),
  prepareRecordingSurface: vi.fn(),
  captureScreenshot: vi.fn(),
  openScreenshot: vi.fn(),
  startRecording: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: captureMock }));

import { useHudCaptureMode } from '../useHudCaptureMode';

const preferences = (options: { mode?: string; shortcut?: string } = {}): PreferenceSettings => ({
  schemaVersion: 3,
  theme: 'system',
  recordingBar: { visibility: 'always' },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: options.shortcut
    ? {
        'quickSnip.toggle': {
          keys: options.shortcut,
          scope: 'global',
          category: 'capture',
        },
      }
    : {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: options.mode ? { captureMode: options.mode } : {},
});

const configuration = (overrides: Partial<RecordingConfiguration> = {}): RecordingConfiguration => ({
  screenKind: 'display',
  screenId: 'display:1',
  cameraId: 'camera:1',
  microphoneId: 'microphone:1',
  systemAudio: true,
  targetFps: 60,
  countdownSeconds: 3,
  recordingBarVisibility: 'always',
  region: null,
  ...overrides,
});

describe('useHudCaptureMode', () => {
  let api!: ReturnType<typeof useHudCaptureMode>;
  let busy!: Ref<boolean>;
  let error!: Ref<string>;
  let wrapper: VueWrapper;
  let unsubscribe!: ReturnType<typeof vi.fn>;

  const mountMode = (embedded = false) => {
    busy = ref(false);
    error = ref('');
    wrapper = mount(
      defineComponent({
        setup() {
          api = useHudCaptureMode(busy, error, embedded);
          return () => null;
        },
      }),
    );
    return api;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribe = vi.fn();
    captureMock.onPreferencesChanged.mockReturnValue(unsubscribe);
    captureMock.updatePreferences.mockResolvedValue(undefined);
    captureMock.quickSnipFromHud.mockResolvedValue({ state: 'completed' });
    captureMock.prepareRecordingSurface.mockResolvedValue(undefined);
    captureMock.captureScreenshot.mockResolvedValue({ id: 'screenshot-1' });
    captureMock.openScreenshot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it('defaults to Studio until preferences load and persists a later Studio selection', async () => {
    mountMode();

    expect(api.captureMode.value).toBe('studio');
    expect(api.modeShortcut.value).toBe('Alt+Shift+S');

    api.hydrateMode(preferences({ mode: 'instant', shortcut: 'Ctrl+Alt+K' }));
    await nextTick();
    expect(api.captureMode.value).toBe('instant');
    expect(api.modeShortcut.value).toBe('Ctrl+Alt+K');

    captureMock.updatePreferences.mockClear();
    api.captureMode.value = 'studio';
    await nextTick();

    expect(captureMock.updatePreferences).toHaveBeenCalledWith({ extras: { captureMode: 'studio' } });
    expect(captureMock.setCameraOverlayActive).toHaveBeenCalledWith(true);
  });

  it('subscribes to mode preferences and unsubscribes when disposed', async () => {
    mountMode();

    expect(captureMock.onPreferencesChanged).toHaveBeenCalledOnce();
    const listener = captureMock.onPreferencesChanged.mock.calls[0]?.[0] as
      | ((next: PreferenceSettings) => void)
      | undefined;
    expect(listener).toBeTypeOf('function');
    listener?.(preferences({ mode: 'screenshot', shortcut: 'Meta+Shift+8' }));
    await nextTick();

    expect(api.captureMode.value).toBe('screenshot');
    expect(api.modeShortcut.value).toBe('Meta+Shift+8');
    expect(captureMock.hideTeleprompter).toHaveBeenCalledOnce();

    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps embedded HUDs isolated from preference writes and native window controls', async () => {
    mountMode(true);
    api.hydrateMode(preferences({ mode: 'screenshot', shortcut: 'Ctrl+Shift+S' }));
    await nextTick();

    expect(api.captureMode.value).toBe('screenshot');
    expect(api.modeShortcut.value).toBe('Ctrl+Shift+S');
    expect(captureMock.onPreferencesChanged).not.toHaveBeenCalled();
    expect(captureMock.updatePreferences).not.toHaveBeenCalled();
    expect(captureMock.setCameraOverlayActive).not.toHaveBeenCalled();
    expect(captureMock.hideTeleprompter).not.toHaveBeenCalled();
  });

  it('keeps Studio capture on the normal recording callback', async () => {
    mountMode();
    const studio = vi.fn();
    const config = configuration();

    await api.captureWithMode(config, studio);

    expect(studio).toHaveBeenCalledWith(config);
    expect(busy.value).toBe(false);
    expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();
    expect(captureMock.captureScreenshot).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a display crop',
      configuration({
        screenKind: 'display',
        screenId: 'display:retina',
        region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 } satisfies ScreenRegion,
      }),
    ],
    ['a selected window', configuration({ screenKind: 'window', screenId: 'window:abc123', region: null })],
  ])('sends %s to Instant without entering the Studio recording path', async (_source, config) => {
    mountMode();
    api.captureMode.value = 'instant';
    await nextTick();
    captureMock.quickSnipFromHud.mockClear();
    const studio = vi.fn();

    const action = api.captureWithMode(config, studio);
    expect(busy.value).toBe(true);
    await action;

    expect(captureMock.quickSnipFromHud).toHaveBeenCalledWith({
      screenKind: config.screenKind,
      screenId: config.screenId,
      region: config.region,
      devices: {
        cameraId: config.cameraId,
        micId: config.microphoneId,
        systemAudioMode: 'on',
      },
    });
    expect(captureMock.startRecording).not.toHaveBeenCalled();
    expect(captureMock.captureScreenshot).not.toHaveBeenCalled();
    expect(studio).not.toHaveBeenCalled();
    expect(busy.value).toBe(false);
  });

  it('hides the HUD, waits for the native surface, captures a still, then opens its editor', async () => {
    const order: string[] = [];
    captureMock.setCameraOverlayActive.mockImplementation(() => order.push('camera-off'));
    captureMock.setWindowVisible.mockImplementation((visible: boolean) =>
      order.push(`hud-${visible ? 'show' : 'hide'}`),
    );
    captureMock.prepareRecordingSurface.mockImplementation(async () => {
      order.push('surface-ready');
    });
    captureMock.captureScreenshot.mockImplementation(async () => {
      order.push('native-screenshot');
      return { id: 'screenshot-1' };
    });
    captureMock.openScreenshot.mockImplementation(async () => {
      order.push('open-editor');
    });
    mountMode();
    api.captureMode.value = 'screenshot';
    await nextTick();
    order.length = 0;
    const studio = vi.fn();
    const config = configuration({
      screenKind: 'display',
      screenId: 'display:2',
      region: { x: 0.25, y: 0.1, width: 0.5, height: 0.6 },
    });

    await api.captureWithMode(config, studio);

    expect(order).toEqual(['camera-off', 'hud-hide', 'surface-ready', 'native-screenshot', 'hud-show', 'open-editor']);
    expect(captureMock.captureScreenshot).toHaveBeenCalledWith({
      screenKind: 'display',
      screenId: 'display:2',
      region: config.region,
    });
    expect(captureMock.openScreenshot).toHaveBeenCalledWith('screenshot-1');
    expect(captureMock.startRecording).not.toHaveBeenCalled();
    expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();
    expect(studio).not.toHaveBeenCalled();
    expect(busy.value).toBe(false);
  });

  it('restores the HUD without an editor or error when screenshot selection is canceled', async () => {
    mountMode();
    api.captureMode.value = 'screenshot';
    captureMock.captureScreenshot.mockResolvedValueOnce(null);
    await api.captureWithMode(configuration(), vi.fn());
    expect(captureMock.openScreenshot).not.toHaveBeenCalled();
    expect(captureMock.setWindowVisible).toHaveBeenLastCalledWith(true);
    expect(error.value).toBe('');
    expect(busy.value).toBe(false);
  });

  it.each([
    ['recording-surface preparation', 'prepare'],
    ['native capture', 'capture'],
    ['editor handoff', 'open'],
  ] as const)('restores HUD visibility when screenshot %s fails', async (_stage, failurePoint) => {
    const message = `${failurePoint} failed`;
    if (failurePoint === 'prepare') captureMock.prepareRecordingSurface.mockRejectedValueOnce(new Error(message));
    if (failurePoint === 'capture') captureMock.captureScreenshot.mockRejectedValueOnce(new Error(message));
    if (failurePoint === 'open') captureMock.openScreenshot.mockRejectedValueOnce(new Error(message));
    mountMode();
    api.captureMode.value = 'screenshot';
    await nextTick();

    await api.captureWithMode(configuration(), vi.fn());

    expect(captureMock.setWindowVisible).toHaveBeenCalledWith(false);
    expect(captureMock.setWindowVisible).toHaveBeenCalledWith(true);
    expect(captureMock.setWindowVisible.mock.calls).toEqual(
      failurePoint === 'open' ? [[false], [true], [true]] : [[false], [true]],
    );
    expect(captureMock.openScreenshot).toHaveBeenCalledTimes(failurePoint === 'open' ? 1 : 0);
    expect(error.value).toBe(message);
    expect(busy.value).toBe(false);
  });
});
