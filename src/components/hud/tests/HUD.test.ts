import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMock as capture } from './capture.mock';
import { browserCameraMock } from './camera-recorder.mock';
import { browserMicrophoneMock } from './microphone-recorder.mock';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));
vi.mock('../../../api/camera-recorder', async () => import('./camera-recorder.mock'));
vi.mock('../../../api/microphone-recorder', async () => import('./microphone-recorder.mock'));
vi.mock('../audio/useAudioLevelMeter', () => ({ useAudioLevelMeter: () => ({ level: ref(0) }) }));
vi.mock('../recorder/useNativeSystemAudioPreview', () => ({ useNativeSystemAudioPreview: () => ({ level: ref(0) }) }));
import HUD from '../HUD.vue';
import Select from '~/ui/select/Select.vue';
import HudIssuesPopover from '../HudIssuesPopover.vue';

const screen = { id: 'native:display:1', kind: 'display' as const, label: 'Display', isDefault: true, displayId: '1' };
const preferences = {
  schemaVersion: 3 as const,
  theme: 'system' as const,
  recordingBar: { visibility: 'always' as const },
  recordingInteractions: { enabled: false, noticeDismissed: false },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients: [] },
  extras: {},
};
const stubs = {
  CapturePresetSelect: { name: 'CapturePresetSelect', emits: ['error'], template: '<div class="preset-stub" />' },
};
let wrapper: VueWrapper | undefined;
const createHud = async (props = {}) => {
  wrapper = mount(HUD, { attachTo: document.body, props, global: { stubs } });
  await flushPromises();
  return wrapper;
};
const openIssues = async (hud: VueWrapper) => {
  await hud.getComponent(HudIssuesPopover).get('.popover-trigger').trigger('mouseenter');
  await flushPromises();
};
const selectScreen = async (hud: VueWrapper) => {
  await hud.get('[aria-label="Full screen"]').trigger('click');
  await flushPromises();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  capture.platform = 'win32';
  capture.devCrossplatform = false;
  capture.selectCaptureSource.mockImplementation(async (kind) => ({
    kind,
    id: kind === 'screen' ? screen.id : 'window:42:0',
    development: false,
    source: {
      id: kind === 'screen' ? screen.id : 'window:42:0',
      kind,
      name: 'Selection',
      app: '',
      detail: '',
      aspect: 1.6,
    },
  }));
  Object.defineProperty(window, 'capture', { configurable: true, value: capture });
  capture.getPreferences.mockResolvedValue(preferences);
  capture.updatePreferences.mockResolvedValue(preferences);
  capture.discover.mockResolvedValue({ sources: [screen], capabilities: {} });
  capture.getSources.mockResolvedValue([
    { id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null, displayId: '1' },
  ]);
  capture.getDisplayBounds.mockResolvedValue({ x: 0, y: 0, width: 1920, height: 1080 });
  capture.selectScreenRegion.mockResolvedValue(null);
  capture.inputAccessStatus.mockResolvedValue({
    state: 'available',
    canRequest: false,
    clicks: true,
    shortcuts: true,
    recordsText: false,
  });
  capture.onPreferencesChanged.mockReturnValue(() => undefined);
  capture.onPreferenceShortcut.mockReturnValue(() => undefined);
  capture.openHudSettings.mockResolvedValue(true);
  capture.openHudProjects.mockResolvedValue(true);
  browserCameraMock.listBrowserCameras.mockResolvedValue([
    { id: 'camera:1', kind: 'camera', label: 'Camera', isDefault: true },
  ]);
  browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([
    { id: 'mic:1', kind: 'microphone', label: 'Microphone', isDefault: true },
  ]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  delete window.capture;
});

describe('horizontal HUD', () => {
  it('renders the three capture cards, labelled modes and themed devices at fixed bounds', async () => {
    const hud = await createHud();
    expect(hud.findAll('.capture-card')).toHaveLength(3);
    expect(hud.get('[aria-label="Recorder"]').attributes('aria-pressed')).toBe('true');
    expect(hud.findAll('.hud-devices .select-trigger')).toHaveLength(3);
    expect(hud.get('.hud-wrapper').attributes('style')).toContain('236px');
    expect(capture.setSize).toHaveBeenLastCalledWith(672, 268);
  });
  it('keeps device menus free of preview eyes while retaining their selected check', async () => {
    const hud = await createHud();
    const selects = hud.findAllComponents(Select);
    expect(selects).toHaveLength(3);
    expect(selects.every((select) => !select.props('showPreviewIndicator'))).toBe(true);
    await selects[0]!.get('.select-trigger').trigger('click');
    await flushPromises();
    const options = document.querySelectorAll<HTMLElement>('[role="option"]');
    expect(options.length).toBeGreaterThan(1);
    options[1]!.dispatchEvent(new Event('pointerenter'));
    await hud.vm.$nextTick();
    expect(document.querySelector('.option-eye')).toBeNull();
    expect(document.querySelector('[aria-selected="true"] .lucide-check')).not.toBeNull();
  });
  it('starts the chosen native screen with the selected devices and restored countdown', async () => {
    capture.getPreferences.mockResolvedValue({
      ...preferences,
      devices: { cameraId: 'camera:1', micId: 'mic:1', systemAudioMode: 'on' },
      extras: { recordingCountdownSeconds: 10 },
      recordingBar: { visibility: 'auto-fade' },
    });
    const hud = await createHud();
    await selectScreen(hud);
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({
      screenId: 'native:display:1',
      screenKind: 'display',
      cameraId: 'camera:1',
      microphoneId: 'mic:1',
      systemAudio: true,
      countdownSeconds: 10,
      recordingBarVisibility: 'auto-fade',
      region: null,
    });
  });
  it('keeps unknown display previews from replacing a native screen identifier', async () => {
    capture.getSources.mockResolvedValue([{ id: 'screen:999', name: 'Display', thumbnail: '', appIcon: null }]);
    const hud = await createHud();
    await selectScreen(hud);
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({ screenId: screen.id });
  });
  it('keeps the complete Electron window ID for backend validation', async () => {
    capture.getSources.mockImplementation(async (types) =>
      types?.[0] === 'window'
        ? [{ id: 'window:42:0', name: 'Editor', thumbnail: '', appIcon: null }]
        : [{ id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null }],
    );
    const hud = await createHud();
    await hud.get('[aria-label="Window"]').trigger('click');
    await flushPromises();
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({ screenKind: 'window', screenId: 'window:42:0' });
  });
  it.each(['Full screen', 'Window'])('opens the Linux Portal directly from %s', async (label) => {
    capture.platform = 'linux';
    capture.discover.mockResolvedValue({
      sources: [
        { ...screen, id: 'portal:display', selectionMode: 'portal' },
        { id: 'portal:window', kind: 'window', label: 'Window', selectionMode: 'portal', isDefault: true },
      ],
      capabilities: {},
    });
    const hud = await createHud();
    await hud.get(`[aria-label="${label}"]`).trigger('click');
    await flushPromises();
    expect(hud.find('.source-picker').exists()).toBe(false);
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({
      screenId: label === 'Window' ? 'portal:window' : 'portal:display',
    });
  });
  it('starts a region only after confirmation and sends a plain crop snapshot', async () => {
    const region = { x: 0.2, y: 0.1, width: 0.5, height: 0.5 };
    capture.selectScreenRegion.mockResolvedValue({ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, region });
    const hud = await createHud();
    await hud.get('[aria-label="Region"]').trigger('click');
    await vi.advanceTimersByTimeAsync(180);
    await flushPromises();
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({ region });
    expect(capture.updatePreferences).toHaveBeenCalledWith({ extras: { screenRegion: region } });
    expect(capture.setInteractive).toHaveBeenCalledWith(true);
  });
  it('keeps cancellation idle and reports a region selection error', async () => {
    const hud = await createHud();
    await hud.get('[aria-label="Region"]').trigger('click');
    await vi.advanceTimersByTimeAsync(180);
    await flushPromises();
    expect(hud.emitted('start-recording')).toBeUndefined();
    capture.selectScreenRegion.mockRejectedValueOnce(new Error('Region failed'));
    await hud.get('[aria-label="Region"]').trigger('click');
    await vi.advanceTimersByTimeAsync(180);
    await flushPromises();
    await openIssues(hud);
    expect(document.body.textContent).toContain('Region failed');
    expect(hud.emitted('start-recording')).toBeUndefined();
  });
  it('opens Settings and Projects without replacing or resizing the HUD', async () => {
    const hud = await createHud();
    const sizeCalls = capture.setSize.mock.calls.length;
    await hud.get('[aria-label="Preferences"]').trigger('click');
    await hud.get('[aria-label="Open a project"]').trigger('click');
    await flushPromises();
    expect(capture.openHudSettings).toHaveBeenCalledOnce();
    expect(capture.openHudProjects).toHaveBeenCalledOnce();
    expect(hud.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
    expect(hud.findAll('.capture-card')).toHaveLength(3);
    expect(capture.setSize.mock.calls).toHaveLength(sizeCalls);
  });
  it('reports a failed panel opening and leaves capture usable', async () => {
    capture.openHudSettings.mockRejectedValueOnce(new Error('Settings failed'));
    const hud = await createHud();
    await hud.get('[aria-label="Preferences"]').trigger('click');
    await flushPromises();
    await openIssues(hud);
    expect(document.body.textContent).toContain('Settings failed');
    await selectScreen(hud);
    expect(hud.emitted('start-recording')).toHaveLength(1);
  });
  it('applies changes from the settings window to the next recording', async () => {
    const hud = await createHud();
    const subscribers = capture.onPreferencesChanged.mock.calls.map(([listener]) => listener);
    for (const listener of subscribers)
      listener({
        ...preferences,
        recordingBar: { visibility: 'hover-only' },
        extras: { recordingCountdownSeconds: 5 },
      });
    await flushPromises();
    await selectScreen(hud);
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({
      countdownSeconds: 5,
      recordingBarVisibility: 'hover-only',
    });
  });
  it('updates camera selection through the overlay without acquiring a second stream', async () => {
    const hud = await createHud();
    hud.findAllComponents(Select)[0]!.vm.$emit('update:modelValue', 'camera:1');
    await flushPromises();
    await flushPromises();
    expect(capture.configureCameraOverlay).toHaveBeenLastCalledWith({ cameraId: 'camera:1' });
    expect(browserCameraMock.request).not.toHaveBeenCalled();
  });
  it('disables unavailable camera and microphone choices when the overlay fails', async () => {
    const hud = await createHud();
    hud.findAllComponents(Select)[0]!.vm.$emit('update:modelValue', 'camera:1');
    await flushPromises();
    capture.onCameraOverlayState.mock.calls[0]?.[0]({ cameraId: 'off', shadowSize: 'md', cornerRadius: 'md' });
    await flushPromises();
    expect(hud.findAllComponents(Select)[0]!.props('modelValue')).toBe('off');
    await openIssues(hud);
    expect(document.body.textContent).toContain('could not produce a usable video stream');
  });
  it('keeps screenshot capture free of recording devices and teleprompter', async () => {
    const hud = await createHud();
    await hud.get('[aria-label="Screenshot"]').trigger('click');
    await flushPromises();
    expect(hud.findAll('.hud-devices .select-trigger')).toHaveLength(0);
    expect(hud.find('.teleprompter-button').exists()).toBe(false);
    expect(hud.findAll('.capture-card')).toHaveLength(3);
  });
  it('leaves native source selection cancellation idle and keeps the HUD usable', async () => {
    capture.selectCaptureSource.mockResolvedValueOnce(null);
    capture.discover.mockResolvedValue({ sources: [], capabilities: {} });
    capture.getSources.mockResolvedValue([]);
    const hud = await createHud();
    await hud.get('[aria-label="Full screen"]').trigger('click');
    await flushPromises();
    expect(hud.findAll('.capture-card')).toHaveLength(3);
    expect(hud.emitted('start-recording')).toBeUndefined();
  });
  it('keeps the record shortcut idle while source selection is pending', async () => {
    let resolve: ((value: null) => void) | undefined;
    capture.selectCaptureSource.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const hud = await createHud();
    await hud.get('[aria-label="Full screen"]').trigger('click');
    capture.onPreferenceShortcut.mock.calls[0]?.[0]('hud.startStopRecording');
    await flushPromises();
    expect(hud.emitted('start-recording')).toBeUndefined();
    resolve?.(null);
    await flushPromises();
    expect(hud.get('[aria-label="Full screen"]').attributes('disabled')).toBeUndefined();
  });
  it('makes discovery failures and startup failures visible within fixed bounds', async () => {
    capture.discover.mockRejectedValueOnce(new Error('Discovery failed'));
    const hud = await createHud({ externalError: 'Capture failed' });
    await openIssues(hud);
    expect(document.body.textContent).toContain('Capture failed');
    expect(hud.get('.hud-wrapper').attributes('style')).toContain('236px');
    await hud.setProps({ externalError: '' });
    expect(document.body.textContent).toContain('Discovery failed');
  });
  it('keeps optional Linux interaction permission visible without blocking capture', async () => {
    capture.platform = 'linux';
    capture.inputAccessStatus.mockResolvedValue({
      state: 'permission-required',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });
    const hud = await createHud();
    expect(hud.getComponent(HudIssuesPopover).props('count')).toBeGreaterThan(0);
    await openIssues(hud);
    await hud.get('[aria-label="Full screen"]').trigger('click');
    await flushPromises();
    expect(hud.emitted('start-recording')?.[0]?.[0]).toMatchObject({ recordInteractions: false });
  });
  it('keeps the embedded tour out of native capture, panels and window controls', async () => {
    const hud = await createHud({ embedded: true, showTopbar: true });
    await hud.get('[aria-label="Full screen"]').trigger('click');
    await hud.get('[aria-label="Preferences"]').trigger('click');
    await hud.get('[aria-label="Close"]').trigger('click');
    expect(capture.discover).not.toHaveBeenCalled();
    expect(capture.setSize).not.toHaveBeenCalled();
    expect(capture.openHudSettings).not.toHaveBeenCalled();
    expect(hud.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
    expect(capture.close).not.toHaveBeenCalled();
    expect(hud.emitted('focus-feature')).toBeDefined();
  });
  it('keeps one loading status in the same shell with cancellation and no titlebar', async () => {
    const hud = await createHud({
      preparingEditor: true,
      editorLoadingProgress: { stage: 'loadingProject', value: 45 },
    });
    expect(hud.find('.editor-preparing-hud').exists()).toBe(true);
    expect(hud.find('.capture-cards').exists()).toBe(false);
    expect(hud.find('[aria-label="Mascot Lab"]').exists()).toBe(false);
    expect(hud.find('.hud-topbar').exists()).toBe(false);
    await hud.get('.editor-preparing-hud button').trigger('click');
    expect(hud.emitted('cancel-editor-opening')).toEqual([[]]);
  });
});

describe('toolbar diagnostics and CSS menu lifetime', () => {
  it('keeps external and local failures visible with separate copy actions', async () => {
    capture.openHudSettings.mockRejectedValueOnce(new Error('Settings unavailable'));
    const hud = await createHud({ externalError: 'Capture engine unavailable' });
    await hud.get('[aria-label="Preferences"]').trigger('click');
    await flushPromises();
    expect(hud.get('.issues-indicator').attributes('aria-label')).toBe('Issues (2)');
    await openIssues(hud);
    expect(document.body.textContent).toContain('Settings unavailable');
    expect(document.body.textContent).toContain('Capture engine unavailable');
    expect(document.querySelectorAll('.hud-issue button[aria-label="Copy error"]')).toHaveLength(2);
    await hud.setProps({ externalError: 'Settings unavailable' });
    expect(hud.get('.issues-indicator').attributes('aria-label')).toBe('Issues (1)');
  });
  it('forwards CSS menu state through blur and mode changes and focuses each device feature', async () => {
    const hud = await createHud();
    const controls = hud.findAllComponents(Select);
    for (const [index, feature, value] of [
      [0, 'camera', 'camera:1'],
      [1, 'mic', 'mic:1'],
      [2, 'systemAudio', 'on'],
    ] as const) {
      controls[index]!.vm.$emit('update:modelValue', value);
      expect(hud.emitted('focus-feature')).toContainEqual([feature]);
    }
    await controls[0]!.get('.select-trigger').trigger('click');
    expect(hud.emitted('popover-toggle')?.at(-1)).toEqual([true]);
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(hud.emitted('popover-toggle')?.at(-1)).toEqual([false]);
    await controls[1]!.get('.select-trigger').trigger('click');
    await hud.get('[aria-label="Screenshot"]').trigger('click');
    await flushPromises();
    expect(hud.emitted('popover-toggle')?.at(-1)).toEqual([false]);
  });
  it('shows preset failures in the toolbar and clears them when the preset control unmounts', async () => {
    const hud = await createHud();
    await hud.get('[aria-label="Instant"]').trigger('click');
    const preset = hud.getComponent({ name: 'CapturePresetSelect' });
    preset.vm.$emit('error', 'Preset unavailable');
    await flushPromises();
    expect(hud.get('.issues-indicator').attributes('aria-label')).toBe('Issues (1)');
    await openIssues(hud);
    expect(document.body.textContent).toContain('Preset unavailable');
    preset.vm.$emit('error', '');
    await flushPromises();
    expect(hud.find('.issues-indicator').exists()).toBe(false);
    await hud.get('.teleprompter-button').trigger('click');
    expect(hud.emitted('focus-feature')).toContainEqual(['teleprompter']);
  });
});

describe('Linux toolbar authorization', () => {
  it('authorizes interaction access from the toolbar popup', async () => {
    capture.platform = 'linux';
    capture.inputAccessStatus.mockResolvedValue({
      state: 'permission-required',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });
    const hud = await createHud();
    await openIssues(hud);
    const control = hud.getComponent({ name: 'InteractionAccessControl' });
    await control.get('button').trigger('click');
    await flushPromises();
    expect(capture.requestInputAccess).toHaveBeenCalled();
    expect(hud.find('.issues-indicator').exists()).toBe(false);
  });
});
