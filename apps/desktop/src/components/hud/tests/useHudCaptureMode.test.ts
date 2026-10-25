import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceSettings } from '~/api/types/capture-api';
import type { ScreenRegion } from '~/api/types/screen-region';
import type { RecordingConfiguration } from '../recorder/recording-types';
import type { PrepareRecording } from '../recorder/capture-preparation-types';
import { useHudCaptureMode } from '../useHudCaptureMode';

const captureMock = vi.hoisted(() => ({
  onPreferencesChanged: vi.fn(),
  updatePreferences: vi.fn(),
  setCameraOverlayActive: vi.fn(),
  hideTeleprompter: vi.fn(),
  quickSnipFromHud: vi.fn(),
  setWindowVisible: vi.fn(),
  showHud: vi.fn(),
  prepareRecordingSurface: vi.fn(),
  captureScreenshot: vi.fn(),
  openScreenshot: vi.fn(),
  startRecording: vi.fn(),
}));
const soundMock = vi.hoisted(() => vi.fn());
vi.mock('~/utils/screenshot-sound', () => ({ playScreenshotSound: soundMock }));

vi.mock('~/api/capture', () => ({ capture: captureMock }));

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

  const mountMode = (
    embedded = false,
    isRecorderLauncher: (() => boolean) | undefined = undefined,
    prepare?: PrepareRecording,
  ) => {
    busy = ref(false);
    error = ref('');
    wrapper = mount(
      defineComponent({
        setup() {
          api = useHudCaptureMode(busy, error, embedded, isRecorderLauncher, prepare);
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

    expect(captureMock.updatePreferences).toHaveBeenCalledWith({
      extras: { captureMode: 'studio' },
    });
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

  it('temporarily forces Studio in the recorder launcher without replacing the preferred Screenshot mode', async () => {
    const recorderLauncherActive = ref(false);
    mountMode(false, () => recorderLauncherActive.value);
    api.hydrateMode(preferences({ mode: 'screenshot' }));
    await nextTick();
    expect(api.captureMode.value).toBe('screenshot');

    captureMock.updatePreferences.mockClear();
    captureMock.setCameraOverlayActive.mockClear();
    recorderLauncherActive.value = true;
    await nextTick();

    expect(api.captureMode.value).toBe('studio');
    expect(captureMock.setCameraOverlayActive).toHaveBeenLastCalledWith(true);
    const config = configuration();
    const studio = vi.fn();
    await api.captureWithMode(config, studio);

    expect(studio).toHaveBeenCalledWith(config);
    expect(captureMock.captureScreenshot).not.toHaveBeenCalled();
    expect(soundMock).not.toHaveBeenCalled();
    expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();

    recorderLauncherActive.value = false;
    await nextTick();

    expect(api.captureMode.value).toBe('screenshot');
    expect(captureMock.setCameraOverlayActive).toHaveBeenLastCalledWith(false);
    expect(captureMock.updatePreferences).not.toHaveBeenCalled();
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
        region: {
          x: 0.1,
          y: 0.2,
          width: 0.5,
          height: 0.4,
        } satisfies ScreenRegion,
      }),
    ],
    [
      'a selected window',
      configuration({
        screenKind: 'window',
        screenId: 'window:abc123',
        region: null,
      }),
    ],
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
      countdownSeconds: config.countdownSeconds,
      hideTaskbar: config.hideTaskbar,
      hideDesktopIcons: config.hideDesktopIcons,
      regionBounds: config.regionOverlay?.bounds,
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
    expect(soundMock).toHaveBeenCalledOnce();
    expect(soundMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      captureMock.captureScreenshot.mock.invocationCallOrder[0]!,
    );
    expect(soundMock.mock.invocationCallOrder[0]).toBeLessThan(captureMock.openScreenshot.mock.invocationCallOrder[0]!);
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
    expect(soundMock).not.toHaveBeenCalled();
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
    expect(soundMock).toHaveBeenCalledTimes(failurePoint === 'open' ? 1 : 0);
  });

  it.each([
    ['full screen', { screenKind: 'display', region: null }],
    ['region', { screenKind: 'display', region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }],
    ['window', { screenKind: 'window', region: null }],
  ] as const)('confirms a successful %s screenshot once', async (_mode, source) => {
    mountMode();
    api.captureMode.value = 'screenshot';
    await api.captureWithMode(configuration(source), vi.fn());
    expect(captureMock.captureScreenshot).toHaveBeenCalledWith(expect.objectContaining(source));
    expect(soundMock).toHaveBeenCalledOnce();
    expect(error.value).toBe('');
  });

  it('finishes confirmation playback before opening the screenshot editor', async () => {
    let finish!: () => void;
    soundMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    mountMode();
    api.captureMode.value = 'screenshot';
    const pending = api.captureWithMode(configuration(), vi.fn());
    await vi.waitFor(() => expect(soundMock).toHaveBeenCalledOnce());
    expect(captureMock.openScreenshot).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(captureMock.openScreenshot).toHaveBeenCalledOnce();
  });
  it.each(['studio', 'instant'] as const)(
    'defers %s until the user explicitly starts, retaining the selected source and countdown',
    async (mode) => {
      let begin!: () => Promise<void>;
      const prepare = vi.fn(
        async (_request: Parameters<PrepareRecording>[0], start: Parameters<PrepareRecording>[1]) => {
          begin = () => start(_request.settings);
        },
      );
      mountMode(false, () => false, prepare);
      const prefs = preferences({ mode });
      prefs.extras.recordingStartAutomatically = false;
      api.hydrateMode(prefs);
      const config = configuration({ screenKind: 'window', screenId: 'window:42:0', countdownSeconds: 3 });
      const studio = vi.fn();
      await api.captureWithMode(config, studio);
      expect(prepare).toHaveBeenCalledWith(
        expect.objectContaining({ settings: expect.objectContaining({ countdownSeconds: 3 }) }),
        expect.any(Function),
      );
      expect(studio).not.toHaveBeenCalled();
      expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();
      await begin();
      if (mode === 'studio') expect(studio).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(config));
      else
        expect(captureMock.quickSnipFromHud).toHaveBeenCalledWith(
          expect.objectContaining({ screenId: 'window:42:0', screenKind: 'window', countdownSeconds: 3 }),
        );
    },
  );
  it('does not interpret a zero countdown as permission to bypass manual start', async () => {
    const prepare = vi.fn();
    mountMode(false, () => false, prepare);
    const prefs = preferences();
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    const studio = vi.fn();
    await api.captureWithMode(configuration({ countdownSeconds: 0 }), studio);
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ countdownSeconds: 0 }) }),
      expect.any(Function),
    );
    expect(studio).not.toHaveBeenCalled();
  });
  it('never silently records when manual preparation is unavailable', async () => {
    mountMode();
    const prefs = preferences();
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    const studio = vi.fn();
    await expect(api.captureWithMode(configuration(), studio)).rejects.toThrow('preparation controls are unavailable');
    expect(studio).not.toHaveBeenCalled();
  });
  it('retains the chosen mode if preferences change while preparation is open', async () => {
    let begin!: () => Promise<void>;
    mountMode(
      false,
      () => false,
      async (_request, start) => {
        begin = () => start(_request.settings);
      },
    );
    const prefs = preferences({ mode: 'instant' });
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    const studio = vi.fn();
    await api.captureWithMode(configuration(), studio);
    api.captureMode.value = 'studio';
    await begin();
    expect(studio).not.toHaveBeenCalled();
    expect(captureMock.quickSnipFromHud).toHaveBeenCalledOnce();
  });
  it('keeps screenshots immediate with manual video start selected', async () => {
    const prepare = vi.fn();
    mountMode(false, () => false, prepare);
    const prefs = preferences({ mode: 'screenshot' });
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    await api.captureWithMode(configuration(), vi.fn());
    expect(prepare).not.toHaveBeenCalled();
    expect(captureMock.captureScreenshot).toHaveBeenCalledOnce();
  });
  it.each([true, undefined, null, 0, 'false'])(
    'keeps automatic start for a non-false preference: %s',
    async (value) => {
      const prepare = vi.fn();
      mountMode(false, () => false, prepare);
      const prefs = preferences();
      prefs.extras.recordingStartAutomatically = value;
      api.hydrateMode(prefs);
      const studio = vi.fn();
      await api.captureWithMode(configuration(), studio);
      expect(prepare).not.toHaveBeenCalled();
      expect(studio).toHaveBeenCalledOnce();
    },
  );
  it('reports a failed mode preference save without starting or changing recording policy', async () => {
    mountMode();
    api.hydrateMode(preferences());
    captureMock.updatePreferences.mockRejectedValueOnce(new Error('Preferences unavailable'));
    api.captureMode.value = 'instant';
    await flushPromises();
    expect(error.value).toBe('Error: Preferences unavailable');
    expect(api.startAutomatically.value).toBe(true);
    expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();
  });
  it('restores the ordinary HUD if Instant fails after the preparation handoff', async () => {
    mountMode(
      false,
      () => false,
      async (_request, start) => start(_request.settings),
    );
    const prefs = preferences({ mode: 'instant' });
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    captureMock.quickSnipFromHud.mockRejectedValueOnce(new Error('Capture failed'));
    await api.captureWithMode(configuration(), vi.fn());
    expect(captureMock.showHud).toHaveBeenCalledOnce();
    expect(error.value).toBe('Capture failed');
    expect(busy.value).toBe(false);
  });

  it('blocks duplicate capture and mode changes from bypassing a pending preparation', async () => {
    let confirm!: () => void;
    mountMode(
      false,
      () => false,
      async (_request, start) => {
        await new Promise<void>((resolve) => {
          confirm = resolve;
        });
        await start(_request.settings);
      },
    );
    const prefs = preferences();
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    const studio = vi.fn();
    const operation = api.captureWithMode(configuration(), studio);
    expect(busy.value).toBe(true);
    expect(studio).not.toHaveBeenCalled();
    api.hydrateMode(preferences({ mode: 'instant' }));
    await api.captureWithMode(configuration(), studio);
    expect(captureMock.quickSnipFromHud).not.toHaveBeenCalled();
    confirm();
    await operation;
    expect(studio).toHaveBeenCalledOnce();
    expect(busy.value).toBe(false);
  });
  it('releases the busy state and permits another attempt if preparation fails', async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error('Preparation failed'))
      .mockImplementationOnce(
        async (_request: Parameters<PrepareRecording>[0], start: Parameters<PrepareRecording>[1]) =>
          start(_request.settings),
      );
    mountMode(false, () => false, prepare);
    const prefs = preferences();
    prefs.extras.recordingStartAutomatically = false;
    api.hydrateMode(prefs);
    const studio = vi.fn();
    await expect(api.captureWithMode(configuration(), studio)).rejects.toThrow('Preparation failed');
    expect(error.value).toBe('Preparation failed');
    expect(busy.value).toBe(false);
    await api.captureWithMode(configuration(), studio);
    expect(studio).toHaveBeenCalledOnce();
  });
  it.each(['studio', 'instant'] as const)(
    'uses every edited preparation control for %s while preserving the source and captured mode',
    async (mode) => {
      let confirm!: () => Promise<void>;
      mountMode(
        false,
        () => false,
        async (request, start) => {
          confirm = () =>
            start({
              ...request.settings,
              cameraId: 'new-camera',
              microphoneId: 'new-mic',
              systemAudio: true,
              countdownSeconds: 7,
              hideTaskbar: true,
              hideDesktopIcons: true,
              showRealCursor: true,
              zoomMode: '3d',
            });
        },
      );
      const prefs = preferences({ mode });
      prefs.extras.recordingStartAutomatically = false;
      api.hydrateMode(prefs);
      const studio = vi.fn(),
        apply = vi.fn();
      const config = configuration({ screenId: 'window:original', screenKind: 'window' });
      await api.captureWithMode(config, studio, apply);
      api.hydrateMode(preferences({ mode: 'screenshot' }));
      await confirm();
      expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ cameraId: 'new-camera', microphoneId: 'new-mic', countdownSeconds: 7 }),
      );
      if (mode === 'studio')
        expect(studio).toHaveBeenCalledWith(
          expect.objectContaining({
            ...config,
            cameraId: 'new-camera',
            microphoneId: 'new-mic',
            systemAudio: true,
            countdownSeconds: 7,
            hideTaskbar: true,
            hideDesktopIcons: true,
            showRealCursor: true,
          }),
        );
      else
        expect(captureMock.quickSnipFromHud).toHaveBeenCalledWith(
          expect.objectContaining({
            screenId: 'window:original',
            screenKind: 'window',
            countdownSeconds: 7,
            devices: { cameraId: 'new-camera', micId: 'new-mic', systemAudioMode: 'on' },
            showRealCursor: true,
          }),
        );
    },
  );
});
