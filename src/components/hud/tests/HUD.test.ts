import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureMock as capture } from './capture.mock';
import { browserCameraMock } from './camera-recorder.mock';
import { browserMicrophoneMock } from './microphone-recorder.mock';
import { browserSystemAudioMock } from './system-audio-recorder.mock';

vi.mock('../../../api/capture', async () => ({ capture: (await import('./capture.mock')).captureMock }));
vi.mock('../../../api/camera-recorder', async () => {
  const camera = await import('./camera-recorder.mock');
  return {
    BrowserCameraRecorder: camera.BrowserCameraRecorder,
    listBrowserCameras: camera.listBrowserCameras,
    isCameraUnavailableError: camera.isCameraUnavailableError,
  };
});
vi.mock('../../../api/microphone-recorder', async () => {
  const microphone = await import('./microphone-recorder.mock');
  return {
    BrowserMicrophoneRecorder: microphone.BrowserMicrophoneRecorder,
    listBrowserMicrophones: microphone.listBrowserMicrophones,
    recordMicrophoneFailure: microphone.recordMicrophoneFailure,
  };
});
vi.mock('../../../api/system-audio-recorder', async () => {
  const systemAudio = await import('./system-audio-recorder.mock');
  return {
    BrowserSystemAudioRecorder: systemAudio.BrowserSystemAudioRecorder,
    recordSystemAudioFailure: systemAudio.recordSystemAudioFailure,
    systemAudioSource: systemAudio.systemAudioSource,
  };
});
vi.mock('../TopbarHUD.vue', () => ({
  default: {
    template:
      '<header><button aria-label="Preferences" @click="$emit(\'open-settings\')"/><button aria-label="Back" @click="$emit(\'back\')"/><button aria-label="Close" @click="$emit(\'close\')"/><button aria-label="Minimize" @click="$emit(\'minimize\')"/></header>',
  },
}));
import HUD from '../HUD.vue';

const catalog = {
  sources: [{ id: 'display:1', kind: 'display', label: 'Display', isDefault: true }],
  capabilities: { systemAudio: true },
};
const stubs = {
  Select: {
    props: ['modelValue', 'options'],
    template:
      '<div class="select"><button class="select-control" @click="$emit(\'toggle\', true)">{{ modelValue }}</button><button class="select-close" @click="$emit(\'toggle\', false)"/><button v-for="option in options" :key="option.value" :data-option-value="option.value" class="select-option" @click="$emit(\'update:modelValue\', option.value)"><img v-if="option.thumbnail" class="select-option-thumbnail" :src="option.thumbnail" />{{ option.label }}</button></div>',
  },
  ProjectPicker: {
    template:
      '<div class="project-picker-stub"><button class="project-back" @click="$emit(\'back\')"/><button class="project-open" @click="$emit(\'open-project\', { id: \'project-1\', name: \'Demo\', previewSrc: \'demo.mp4\' })"/><button class="project-toggle" @click="$emit(\'toggle-popover\', true)"/></div>',
  },
  HudPreferences: {
    props: ['inputAccess', 'recordInteractions', 'requestingInputAccess'],
    template:
      '<div class="preferences-stub"><span class="preferences-input-access">{{ inputAccess?.state }}</span><span v-if="inputAccess?.state === \'available\'" class="preferences-switch">Switch</span><button v-else-if="inputAccess?.canRequest" class="preferences-allow">Allow</button><button class="preference-update" @click="$emit(\'update:countdown-seconds\', 10)"/><button class="preference-visibility" @click="$emit(\'update:recording-bar-visibility\', \'auto-fade\')"/><button class="preference-legacy-top" @click="$emit(\'update:always-on-top\', true)"/><button @click="$emit(\'close\')">Return</button></div>',
  },
  CameraPreviewOverlay: { template: '<div class="camera-preview-stub" />' },
};
const ready = async () => {
  await flushPromises();
  await Promise.resolve();
};
const getDisplayMedia = vi.fn();
const emptyDisplayStream = () => ({
  getAudioTracks: () => [],
  getVideoTracks: () => [],
  getTracks: () => [],
});
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

describe('HUD', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capture.platform = 'darwin';
    getDisplayMedia.mockReset();
    getDisplayMedia.mockResolvedValue(emptyDisplayStream());
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }), getDisplayMedia },
        configurable: true,
      });
    } else {
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue({ getTracks: () => [] } as any);
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        configurable: true,
        value: getDisplayMedia,
      });
    }
    Object.values(capture).forEach((mock) => {
      if (vi.isMockFunction(mock)) mock.mockReset();
    });
    Object.values(browserCameraMock).forEach((mock) => mock.mockReset());
    Object.values(browserMicrophoneMock).forEach((mock) => mock.mockReset());
    Object.values(browserSystemAudioMock).forEach((mock) => mock.mockReset());
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: { cameraId: 'camera:chromium:device-1', micId: 'microphone:chromium:device-1', systemAudioMode: 'off' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.inputAccessStatus.mockResolvedValue({
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    });
    capture.requestInputAccess.mockResolvedValue({
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    });
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.onPreferenceShortcut.mockReturnValue(() => undefined);
    capture.onCameraOverlayState.mockReturnValue(() => undefined);
    capture.onCameraOverlayHover.mockReturnValue(() => undefined);
    capture.onCameraShadow.mockReturnValue(() => undefined);
    browserSystemAudioMock.systemAudioSource.mockReturnValue({
      id: 'system-audio:chromium:desktop-loopback',
      kind: 'system-audio',
      label: 'System audio',
      isDefault: true,
    });
    browserCameraMock.listBrowserCameras.mockResolvedValue([
      { id: 'camera:chromium:device-1', kind: 'camera', label: 'Cam', isDefault: true },
    ]);
    browserMicrophoneMock.listBrowserMicrophones.mockResolvedValue([
      { id: 'microphone:chromium:device-1', kind: 'microphone', label: 'Mic', isDefault: true },
    ]);
    browserCameraMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() });
    browserMicrophoneMock.request.mockResolvedValue({ onFatal: vi.fn(), start: vi.fn(), stop: vi.fn(), fail: vi.fn() });
    browserSystemAudioMock.request.mockResolvedValue({
      onFatal: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      fail: vi.fn(),
    });
    capture.discover.mockResolvedValue(catalog);
    capture.getSources.mockResolvedValue([{ id: 'screen:1', name: 'Display', thumbnail: '', appIcon: null }]);
    capture.getDisplayBounds.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.capture;
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete (navigator as { clipboard?: Clipboard }).clipboard;
    if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
    else delete (document as { execCommand?: typeof document.execCommand }).execCommand;
  });
  it('discovers defaults and starts a screen recording with selected sources', async () => {
    capture.startRecording.mockResolvedValue({ state: 'recording', sessionId: '019f84dd-4d9d-7f61-ac30-5da50169ecbc' });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    await record?.trigger('click');
    await ready();
    expect(capture.startRecording).not.toHaveBeenCalled();
    expect(browserCameraMock.request).not.toHaveBeenCalled();
    expect(browserMicrophoneMock.request).not.toHaveBeenCalled();
    expect(wrapper.emitted('start-recording')).toEqual([
      [
        expect.objectContaining({
          screenKind: 'display',
          screenId: 'display:1',
          microphoneId: 'microphone:chromium:device-1',
          cameraId: 'camera:chromium:device-1',
          systemAudio: false,
          targetFps: 60,
        }),
      ],
    ]);
  });
  it('shows actionable errors when discovery or recording fails', async () => {
    capture.discover.mockRejectedValueOnce(new Error('permission denied'));
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    expect(wrapper.get('[role=alert]').text()).toContain('permission denied');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    await record?.trigger('click');
    await ready();
    expect(wrapper.emitted('start-recording')).toHaveLength(1);
    expect(wrapper.get('[role=alert]').text()).toContain('permission denied');
  });

  it('disables Start Recording and ignores click or shortcut when no capture source exists', async () => {
    const shortcuts: Array<(action: string) => void> = [];
    capture.discover.mockResolvedValueOnce({ sources: [], capabilities: {} });
    capture.getSources.mockResolvedValue([]);
    capture.onPreferenceShortcut.mockImplementationOnce((listener: (action: string) => void) => {
      shortcuts.push(listener);
      return () => undefined;
    });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    expect(record).toBeDefined();
    expect(record!.element).toHaveProperty('disabled', true);

    await record!.trigger('click');
    shortcuts[0]?.('hud.startStopRecording');
    await ready();

    expect(wrapper.emitted('start-recording')).toBeUndefined();
    expect(capture.startRecording).not.toHaveBeenCalled();
  });

  it('shows Linux requirement diagnostics without blocking an optimistic Portal attempt', async () => {
    const linuxCapture = { ...capture, platform: 'linux' };
    Object.defineProperty(window, 'capture', { configurable: true, value: linuxCapture });
    capture.platform = 'linux';
    capture.discover.mockResolvedValueOnce({
      sources: [
        {
          id: 'portal:monitor',
          kind: 'display',
          label: 'Choose a screen with the system picker',
          isDefault: true,
          selectionMode: 'portal',
        },
      ],
      capabilities: {},
      diagnostics: {
        platform: 'linux',
        linux: {
          distribution: 'Debian GNU/Linux 13',
          distributionId: 'debian',
          distributionLike: [],
          distributionVersion: '13',
          kernel: '6.12.0',
          architecture: 'x86_64',
          desktop: 'GNOME',
          sessionType: 'x11',
          displayServer: 'x11',
          backend: 'xdg-portal-pipewire',
          portal: {
            available: false,
            version: null,
            monitor: null,
            window: null,
            metadataCursor: null,
            errorCode: 'portal-unavailable',
            detail: 'ScreenCast portal is unavailable',
          },
          pipewire: { available: true, errorCode: null, detail: null },
          ffmpeg: {
            available: false,
            encoder: null,
            codec: null,
            hardware: null,
            errorCode: 'ffmpeg-unavailable',
            detail: 'FFmpeg is unavailable',
          },
          recordingAvailable: false,
        },
      },
    });
    capture.getSources.mockResolvedValueOnce([]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    expect(record).toBeDefined();
    expect(record!.element).toHaveProperty('disabled', false);
    const issue = wrapper.get('.hud-issue-error');
    expect(issue.get('.hud-issue-title').text()).toBe('Linux setup required');
    expect(issue.text()).toContain('XDG ScreenCast Portal: ScreenCast portal is unavailable');
    expect(issue.text()).toContain('FFmpeg: FFmpeg is unavailable');
    const copyButton = issue.get('.copy-button-idle');
    expect(copyButton.attributes('aria-label')).toBe('Copy fix');
    expect(copyButton.attributes('data-state')).toBe('idle');
    await copyButton.trigger('click');
    await ready();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Beam Linux requirement: XDG ScreenCast Portal'));
    expect(issue.get('.copy-button-copied').attributes('aria-label')).toBe('Copied');
    expect(issue.get('.copy-button-copied').attributes('data-state')).toBe('copied');
    await record!.trigger('click');
    expect(wrapper.emitted('start-recording')).toEqual([
      [expect.objectContaining({ screenKind: 'display', screenId: 'portal:monitor' })],
    ]);
    expect(capture.startRecording).not.toHaveBeenCalled();
  });

  it('shows Enable for optional Linux interaction access without blocking Start', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.inputAccessStatus.mockResolvedValueOnce({
      state: 'permission-required',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });
    let resolveRequest!: (value: {
      state: 'available';
      canRequest: false;
      clicks: true;
      shortcuts: true;
      recordsText: false;
    }) => void;
    capture.requestInputAccess.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const issue = wrapper.get('.hud-issue-warning');
    expect(issue.get('.hud-issue-title').text()).toBe('Allow keyboard shortcut recording');
    expect(issue.get('.hud-issue-action').text()).toContain('Enable');
    expect(issue.find('.copy-button-idle').exists()).toBe(false);
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    expect(record.element).toHaveProperty('disabled', false);

    const authorization = issue.get('.hud-issue-action').trigger('click');
    await ready();
    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(wrapper.get('.hud-issue-warning .hud-issue-action').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.hud-issue-warning .hud-issue-action').find('.icon-spin').exists()).toBe(true);

    resolveRequest({
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    });
    await authorization;
    await ready();

    const success = wrapper.get('.hud-issue-success');
    expect(success.get('.hud-issue-title').text()).toBe('Interaction access enabled');
    expect(success.text()).toContain('Mouse clicks and keyboard shortcuts can now be recorded');
    expect(wrapper.find('.hud-issue-warning').exists()).toBe(false);
    expect(record.element).toHaveProperty('disabled', false);
  });

  it('auto-starts persisted Linux authorization and removes Enable after success', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: true, noticeDismissed: true },
      alwaysOnTop: true,
      devices: { cameraId: 'camera:chromium:device-1', micId: 'microphone:chromium:device-1', systemAudioMode: 'off' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.inputAccessStatus.mockResolvedValueOnce({
      state: 'permission-required',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });
    capture.requestInputAccess.mockResolvedValueOnce({
      state: 'available',
      canRequest: false,
      clicks: true,
      shortcuts: true,
      recordsText: false,
    });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    expect(capture.requestInputAccess).toHaveBeenCalledOnce();
    expect(wrapper.find('.hud-issue-warning').exists()).toBe(false);
    expect(wrapper.find('.hud-issue .hud-issue-action').exists()).toBe(false);
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    expect(record.element).toHaveProperty('disabled', false);
  });

  it('keeps Linux Start available when interaction permission is still required', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: true },
      alwaysOnTop: true,
      devices: { cameraId: 'camera:chromium:device-1', micId: 'microphone:chromium:device-1', systemAudioMode: 'off' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.inputAccessStatus.mockResolvedValueOnce({
      state: 'permission-required',
      canRequest: true,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const issue = wrapper.get('.hud-issue-warning');
    expect(issue.get('.hud-issue-action').text()).toContain('Enable');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    expect(record.element).toHaveProperty('disabled', false);
  });

  it('resynchronizes interaction access when Settings opens after HUD authorization', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.inputAccessStatus
      .mockResolvedValueOnce({
        state: 'permission-required',
        canRequest: true,
        clicks: false,
        shortcuts: false,
        recordsText: false,
      })
      .mockResolvedValueOnce({
        state: 'available',
        canRequest: false,
        clicks: true,
        shortcuts: true,
        recordsText: false,
      });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    await ready();

    expect(capture.inputAccessStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.get('.preferences-input-access').text()).toBe('available');
    expect(wrapper.find('.preferences-allow').exists()).toBe(false);
    expect(wrapper.find('.preferences-switch').exists()).toBe(true);
  });

  it('offers interaction diagnostics without blocking Start when access is unavailable', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.inputAccessStatus.mockResolvedValueOnce({
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
    });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    expect(wrapper.get('.hud-issue-info').text()).toContain('Interaction recording unavailable');
    expect(wrapper.find('.hud-issue-info .copy-button-idle').exists()).toBe(true);
    expect(wrapper.get('.hud-issue-info').text()).not.toContain('Enable');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    expect(record.element).toHaveProperty('disabled', false);
    await record.trigger('click');
    expect(wrapper.emitted('start-recording')).toEqual([[expect.objectContaining({ recordInteractions: false })]]);
  });

  it('does not acquire system audio for an idle HUD when the preference is restored as on', async () => {
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: { systemAudioMode: 'on' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    expect(getDisplayMedia).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not acquire system audio for an embedded idle HUD when the preference is restored as on', async () => {
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: { systemAudioMode: 'on' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });

    const wrapper = mount(HUD, { props: { embedded: true }, global: { stubs } });
    await ready();

    expect(wrapper.find('.hud-wrapper.embedded').exists()).toBe(true);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves restored system audio on Linux before emitting a recording config', async () => {
    capture.platform = 'linux';
    Object.defineProperty(window, 'capture', { configurable: true, value: capture });
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: { systemAudioMode: 'on' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
    capture.discover.mockResolvedValueOnce({
      sources: [
        {
          id: 'portal:monitor',
          kind: 'display',
          label: 'Choose a screen',
          isDefault: true,
          selectionMode: 'portal',
        },
      ],
      capabilities: { portalSelection: true },
    });
    capture.getSources.mockResolvedValue([]);

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    await record?.trigger('click');
    await ready();

    expect(wrapper.emitted('start-recording')).toContainEqual([expect.objectContaining({ systemAudio: true })]);
    expect(browserSystemAudioMock.request).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not initialize capture APIs when an embedded HUD mounts', async () => {
    const wrapper = mount(HUD, { props: { embedded: true }, global: { stubs } });
    await ready();

    expect(wrapper.find('.hud-wrapper.embedded').exists()).toBe(true);
    expect(capture.getPreferences).not.toHaveBeenCalled();
    expect(capture.discover).not.toHaveBeenCalled();
    expect(capture.getSources).not.toHaveBeenCalled();
    expect(capture.inputAccessStatus).not.toHaveBeenCalled();
    expect(capture.configureCameraOverlay).not.toHaveBeenCalled();
    expect(capture.updatePreferences).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps Linux Portal sources selectable without Electron desktop previews', async () => {
    capture.discover.mockResolvedValueOnce({
      sources: [
        {
          id: 'portal:monitor',
          kind: 'display',
          label: 'Choose a screen',
          isDefault: true,
          selectionMode: 'portal',
        },
        {
          id: 'portal:window',
          kind: 'window',
          label: 'Choose a window',
          isDefault: false,
          selectionMode: 'portal',
        },
      ],
      capabilities: { separateCursor: true },
    });
    capture.getSources.mockResolvedValue([]);
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const windowTab = wrapper.findAll('button').find((button) => button.text().trim() === 'Window');
    await windowTab?.trigger('click');
    await ready();
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    expect(record?.element).toHaveProperty('disabled', false);
    await record?.trigger('click');
    await ready();

    expect(wrapper.emitted('start-recording')).toContainEqual([
      expect.objectContaining({ screenKind: 'window', screenId: 'portal:window' }),
    ]);
  });

  it('switches views and delegates window controls safely', async () => {
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.find('.preferences-stub').exists()).toBe(true);
    await wrapper.get('.preferences-stub button:last-child').trigger('click');
    await wrapper.get('.project-btn').trigger('click');
    expect(wrapper.find('.project-picker-stub').exists()).toBe(true);
    await wrapper.get('[aria-label="Close"]').trigger('click');
    expect(capture.close).toHaveBeenCalledOnce();
    expect(capture.quit).not.toHaveBeenCalled();
  });

  it('closes the HUD immediately while the editor loading card is visible', async () => {
    const wrapper = mount(HUD, {
      props: { preparingEditor: true, editorLoadingProgress: { stage: 'openingWindow', value: 10 } },
      global: { stubs },
    });
    await ready();

    expect(capture.setInteractive).toHaveBeenCalledWith(true);
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    vi.advanceTimersByTime(160);
    expect(capture.minimize).toHaveBeenCalledOnce();

    await wrapper.get('[aria-label="Close"]').trigger('click');

    expect(capture.close).toHaveBeenCalledOnce();
    expect(capture.quit).not.toHaveBeenCalled();
  });

  it('keeps available interaction access out of the main HUD and preserves its height', async () => {
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    expect(wrapper.get('.hud-wrapper').attributes('style')).toContain('height: 480px');
    expect(wrapper.find('.hud-body .interaction-access-notice').exists()).toBe(false);
    expect(wrapper.find('.hud-body [role="status"]').exists()).toBe(false);
    expect(wrapper.find('.preferences-input-access').exists()).toBe(false);

    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.get('.preferences-input-access').text()).toBe('available');
  });

  it('keeps the normal HUD height when an issue appears and disappears', async () => {
    const wrapper = mount(HUD, {
      props: { externalError: 'Temporary recording failure' },
      global: { stubs },
    });
    await ready();

    expect(wrapper.find('.hud-issue-error').exists()).toBe(true);
    expect(wrapper.get('.recording-action-stack').classes()).toContain('has-issues');
    expect(wrapper.find('.hud-issues').exists()).toBe(true);
    expect(wrapper.get('.hud-wrapper').attributes('style')).toContain('height: 480px');
    expect(capture.setSize.mock.calls.map(([, height]) => height)).toContain(512);
    expect(capture.setSize.mock.calls.map(([, height]) => height)).not.toContain(628);

    await wrapper.setProps({ externalError: undefined });
    await ready();
    vi.advanceTimersByTime(220);
    await ready();

    expect(wrapper.find('.hud-issue-error').exists()).toBe(false);
    expect(wrapper.get('.recording-action-stack').classes()).not.toContain('has-issues');
    expect(wrapper.find('.hud-issues').exists()).toBe(false);
    expect(wrapper.get('.hud-wrapper').attributes('style')).toContain('height: 480px');
    expect(capture.setSize.mock.calls.map(([, height]) => height)).not.toContain(628);
  });

  it('replaces the HUD body with editor loading progress inside the same card', async () => {
    const wrapper = mount(HUD, {
      props: {
        preparingEditor: true,
        editorLoadingProgress: { stage: 'loadingTimeline', value: 65 },
      },
      global: { stubs },
    });
    await ready();

    expect(wrapper.find('.hud-wrapper').exists()).toBe(true);
    expect(wrapper.find('.hud-body').exists()).toBe(false);
    expect(wrapper.get('.editor-preparing-hud').text().replaceAll('\u00a0', ' ')).toContain('Loading the timeline');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('65');
    expect(capture.setInteractive).toHaveBeenCalledWith(true);
  });

  it('switches to window capture, handles device choices and preference shortcuts', async () => {
    capture.getSources.mockImplementation(async (types: string[]) =>
      types[0] === 'window'
        ? [{ id: 'window:123:0', name: 'Editor window', thumbnail: 'thumb', appIcon: null }]
        : [
            {
              id: 'display:preview',
              name: 'Display',
              thumbnail: 'thumb',
              displayId: 'display:1',
              displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
            },
          ],
    );
    capture.discover.mockResolvedValue({
      sources: [
        { id: 'display:1', kind: 'display', label: 'Display', isDefault: true },
        { id: 'window:7b', kind: 'window', label: 'Editor' },
      ],
      capabilities: { systemAudio: true },
    });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Window')
      ?.trigger('click');
    await ready();
    expect(wrapper.findAll('.select-option').some((option) => option.text() === 'Editor window')).toBe(true);
    await wrapper
      .findAll('.select-option')
      .find((option) => option.text() === 'Editor window')
      ?.trigger('click');
    await wrapper
      .findAll('.select-option')
      .find((button) => button.text() === 'System audio')
      ?.trigger('click');
    await wrapper
      .findAll('.select-option')
      .find((button) => button.text() === 'Mic')
      ?.trigger('click');
    await wrapper
      .findAll('.select-option')
      .find((button) => button.text() === 'Cam')
      ?.trigger('click');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    await record.trigger('click');
    expect(wrapper.emitted('start-recording')).toContainEqual([
      expect.objectContaining({
        screenKind: 'window',
        screenId: 'window:123:0',
        systemAudio: true,
        cameraId: 'camera:chromium:device-1',
        microphoneId: 'microphone:chromium:device-1',
      }),
    ]);
    const shortcut = capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;
    shortcut?.('ignored.action');
    shortcut?.('hud.startStopRecording');
    await ready();
    expect(wrapper.emitted('start-recording')).toHaveLength(2);
    await wrapper.find('.select-control').trigger('click');
    expect(capture.setSize).toHaveBeenCalled();
  });

  it('caches screen and window previews across tab switches with separate selections', async () => {
    capture.discover.mockResolvedValue({
      sources: [
        { id: 'sck:display:1', kind: 'display', label: 'Display 1', isDefault: true, displayId: '1' },
        { id: 'sck:display:2', kind: 'display', label: 'Display 2', isDefault: false, displayId: '2' },
      ],
      capabilities: { systemAudio: true },
    });
    capture.getSources.mockImplementation(async (types: string[]) =>
      types[0] === 'screen'
        ? [
            {
              id: 'screen:1',
              name: 'Screen 1',
              thumbnail: 'screen-1',
              appIcon: null,
              displayId: '1',
            },
            {
              id: 'screen:2',
              name: 'Screen 2',
              thumbnail: 'screen-2',
              appIcon: null,
              displayId: '2',
            },
          ]
        : [
            { id: 'window:1', name: 'Window 1', thumbnail: 'window-1', appIcon: null },
            { id: 'window:2', name: 'Window 2', thumbnail: 'window-2', appIcon: null },
          ],
    );

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const callsFor = (type: string) =>
      capture.getSources.mock.calls.filter(([requested]) => (requested as string[])[0] === type);
    expect(callsFor('screen')).toHaveLength(1);
    expect(callsFor('window')).toHaveLength(1);

    const screenTwo = wrapper
      .findAll('[data-option-value]')
      .find((option) => option.attributes('data-option-value') === 'sck:display:2');
    expect(screenTwo).toBeDefined();
    await screenTwo!.trigger('click');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Window')
      ?.trigger('click');
    await ready();
    const windowTwo = wrapper
      .findAll('[data-option-value]')
      .find((option) => option.attributes('data-option-value') === 'window:2');
    expect(windowTwo).toBeDefined();
    await windowTwo!.trigger('click');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Screen')
      ?.trigger('click');
    await ready();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Start Recording'))
      ?.trigger('click');
    expect(wrapper.emitted('start-recording')?.at(-1)?.[0]).toEqual(
      expect.objectContaining({ screenKind: 'display', screenId: 'sck:display:2' }),
    );

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Window')
      ?.trigger('click');
    await ready();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Start Recording'))
      ?.trigger('click');
    expect(wrapper.emitted('start-recording')?.at(-1)?.[0]).toEqual(
      expect.objectContaining({ screenKind: 'window', screenId: 'window:2' }),
    );

    expect(callsFor('screen')).toHaveLength(1);
    expect(callsFor('window')).toHaveLength(1);
  });

  it('selects and confirms a screen region, persists it, and handles region errors', async () => {
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: {},
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: { screenRegion: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
    });
    capture.getSources.mockResolvedValue([
      {
        id: 'display:preview',
        name: 'Display',
        thumbnail: 'thumb',
        displayId: 'display:1',
        displayBounds: { x: 10, y: 20, width: 1920, height: 1080 },
      },
    ]);
    capture.selectScreenRegion.mockResolvedValue({ x: 0.2, y: 0.25, width: 0.4, height: 0.3 });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    const regionButton = wrapper.get('[aria-label="Select an area of the screen"]');
    await regionButton.trigger('click');
    vi.advanceTimersByTime(180);
    await ready();
    expect(capture.setWindowVisible).toHaveBeenNthCalledWith(1, false);
    expect(capture.selectScreenRegion).toHaveBeenCalledWith({
      bounds: { x: 10, y: 20, width: 1920, height: 1080 },
      region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    });
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: { screenRegion: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 } },
    });
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true);
    expect(wrapper.find('[aria-label="Screen area selected"]').exists()).toBe(true);
    vi.advanceTimersByTime(700);
    capture.selectScreenRegion.mockRejectedValueOnce(new Error('region denied'));
    await wrapper.get('[aria-label="Screen area selected"]').trigger('click');
    vi.advanceTimersByTime(180);
    await ready();
    expect(wrapper.get('[role="alert"]').text()).toContain('region denied');
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true);
  });

  it('keeps macOS region selection enabled when the preview has no display bounds', async () => {
    capture.discover.mockResolvedValue({
      sources: [
        {
          id: 'sck:display:123',
          kind: 'display',
          label: 'Screen 1',
          isDefault: true,
          displayId: '123',
        },
      ],
      capabilities: { systemAudio: true },
    });
    capture.getSources.mockResolvedValue([
      {
        id: 'screen:123',
        name: 'Screen 1',
        thumbnail: '',
        appIcon: null,
        displayId: '123',
      },
    ]);
    capture.getDisplayBounds.mockResolvedValue({ x: 24, y: 48, width: 2560, height: 1440 });
    capture.selectScreenRegion.mockResolvedValue({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    expect(capture.getDisplayBounds).toHaveBeenCalledWith('123');
    const regionButton = wrapper.get('[aria-label="Select an area of the screen"]');
    expect(regionButton.attributes('disabled')).toBeUndefined();

    await regionButton.trigger('click');
    vi.advanceTimersByTime(180);
    await ready();

    expect(capture.selectScreenRegion).toHaveBeenCalledWith({
      bounds: { x: 24, y: 48, width: 2560, height: 1440 },
      region: null,
    });
  });

  it('shows the matching screen thumbnail without replacing the native screen id', async () => {
    capture.discover.mockResolvedValue({
      sources: [
        {
          id: 'sck:display:123',
          kind: 'display',
          label: 'Screen 1',
          isDefault: true,
          displayId: '123',
        },
        {
          id: 'sck:display:456',
          kind: 'display',
          label: 'Screen 2',
          isDefault: false,
          displayId: '456',
        },
      ],
      capabilities: { systemAudio: true },
    });
    capture.getSources.mockResolvedValue([
      {
        id: 'screen:123',
        name: 'Screen 1 preview',
        thumbnail: 'data:image/png;base64,screen-1',
        appIcon: null,
        displayId: '123',
      },
      {
        id: 'screen:456',
        name: 'Screen 2 preview',
        thumbnail: 'data:image/png;base64,screen-2',
        appIcon: null,
        displayId: '456',
      },
    ]);
    capture.getDisplayBounds.mockImplementation(async (displayId: string) => ({
      x: displayId === '456' ? 2560 : 0,
      y: 0,
      width: 1920,
      height: 1080,
    }));

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const secondScreenOption = wrapper
      .findAll('[data-option-value]')
      .find((option) => option.attributes('data-option-value') === 'sck:display:456');
    expect(secondScreenOption).toBeDefined();
    expect(secondScreenOption?.find('.select-option-thumbnail').attributes('src')).toBe(
      'data:image/png;base64,screen-2',
    );

    await secondScreenOption?.trigger('click');
    await ready();
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    await record?.trigger('click');

    expect(wrapper.emitted('start-recording')).toContainEqual([
      expect.objectContaining({ screenKind: 'display', screenId: 'sck:display:456' }),
    ]);
  });

  it('matches a numeric Electron preview to a Windows native display without changing its id', async () => {
    const windowsDisplayId = String.raw`\\.\DISPLAY1`;
    const nativeSourceId = `wgc:monitor:${windowsDisplayId}`;
    capture.discover.mockResolvedValue({
      sources: [
        {
          id: nativeSourceId,
          kind: 'display',
          label: 'Screen 1',
          isDefault: true,
          displayId: windowsDisplayId,
        },
      ],
      capabilities: { systemAudio: true },
    });
    capture.getSources.mockResolvedValue([
      {
        id: 'screen:123456',
        name: 'Screen 1 preview',
        thumbnail: 'data:image/png;base64,windows-screen-1',
        appIcon: null,
        displayId: 123456,
      },
    ]);

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    const screenOption = wrapper
      .findAll('[data-option-value]')
      .find((option) => option.attributes('data-option-value') === nativeSourceId);
    expect(screenOption).toBeDefined();
    expect(screenOption?.find('.select-option-thumbnail').attributes('src')).toBe(
      'data:image/png;base64,windows-screen-1',
    );

    await screenOption?.trigger('click');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'));
    await record?.trigger('click');

    expect(wrapper.emitted('start-recording')).toContainEqual([
      expect.objectContaining({ screenKind: 'display', screenId: nativeSourceId }),
    ]);
  });

  it('clones Windows fallback bounds and restores an interactive HUD after a crop IPC error', async () => {
    const windowsDisplayId = String.raw`\\.\DISPLAY1`;
    const nativeSourceId = `wgc:monitor:${windowsDisplayId}`;
    const cloneError = new DOMException('The object could not be cloned.', 'DataCloneError');
    capture.discover.mockResolvedValue({
      sources: [
        {
          id: nativeSourceId,
          kind: 'display',
          label: 'Screen 1',
          isDefault: true,
          displayId: windowsDisplayId,
        },
      ],
      capabilities: { systemAudio: true },
    });
    capture.getSources.mockResolvedValue([
      {
        id: 'screen:123456',
        name: 'Screen 1 preview',
        thumbnail: 'data:image/png;base64,windows-screen-1',
        appIcon: null,
        displayId: 123456,
        displayBounds: { x: 0, y: 0, width: 2560, height: 1440 },
      },
    ]);
    capture.getDisplayBounds.mockResolvedValue(null);
    capture.selectScreenRegion.mockImplementation(async (options: unknown) => {
      expect(() => structuredClone(options)).not.toThrow();
      throw cloneError;
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    const regionButton = wrapper.get('[aria-label="Select an area of the screen"]');
    expect(regionButton.attributes('disabled')).toBeUndefined();

    await regionButton.trigger('click');
    vi.advanceTimersByTime(180);
    await ready();

    expect(capture.selectScreenRegion).toHaveBeenCalledWith({
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      region: null,
    });
    expect(capture.setWindowVisible).toHaveBeenNthCalledWith(1, false);
    expect(capture.setWindowVisible).toHaveBeenLastCalledWith(true);
    expect(capture.setInteractive).toHaveBeenLastCalledWith(true);
    expect(wrapper.get('[role="alert"]').text()).toContain('The object could not be cloned.');

    await wrapper.get('[aria-label="Copy error"]').trigger('click');
    await ready();
    expect(writeText).toHaveBeenCalledWith(String(cloneError));
  });

  it('copies discovery errors through the clipboard fallback and reports copied state', async () => {
    capture.discover.mockRejectedValueOnce(new Error('discover failed'));
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper.get('[aria-label="Copy error"]').trigger('click');
    await ready();
    expect(writeText).toHaveBeenCalledWith('discover failed');
    expect(wrapper.get('[aria-label="Copied"]').attributes('data-state')).toBe('copied');
  });

  it('stops an active session and reports the stop event', async () => {
    capture.stop.mockResolvedValue({ state: 'stopped', sessionId: 'session-1' });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    (wrapper.vm as any).$.setupState.isRecording = true;
    await wrapper.vm.$nextTick();
    const record = wrapper.findAll('button').find((button) => button.text().includes('Stop ('))!;
    await record.trigger('click');
    await ready();
    expect(capture.stop).toHaveBeenCalledOnce();
    expect(wrapper.emitted('stop-recording')).toEqual([[{ state: 'stopped', sessionId: 'session-1' }]]);
  });

  it('handles empty window catalogs, dropdown resize transitions, and native topbar controls', async () => {
    capture.getPreferences.mockResolvedValueOnce({
      schemaVersion: 3,
      theme: 'system',
      recordingBar: { visibility: 'auto-fade' },
      recordingInteractions: { enabled: false, noticeDismissed: false },
      alwaysOnTop: true,
      devices: { cameraId: 'missing', micId: 'missing', systemAudioMode: 'invalid' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: { screenRegion: { x: 2, y: 2, width: 0, height: 0 } },
    });
    capture.discover.mockResolvedValueOnce({
      sources: [{ id: 'window:abc', kind: 'window', label: 'Only window' }],
      capabilities: {},
    });
    capture.getSources.mockResolvedValue([]);
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Window')
      ?.trigger('click');
    await ready();
    expect(wrapper.find('.select').exists()).toBe(true);
    expect(wrapper.findAll('.select-option').some((option) => option.text() === 'Only window')).toBe(false);
    await wrapper.get('.select-control').trigger('click');
    await wrapper.get('.select-close').trigger('click');
    vi.advanceTimersByTime(220);
    await wrapper.get('[aria-label="Open teleprompter"]').trigger('click');
    expect(capture.showTeleprompter).toHaveBeenCalledOnce();
    await wrapper.get('[aria-label="Minimize"]').trigger('click');
    vi.advanceTimersByTime(160);
    expect(capture.minimize).toHaveBeenCalledOnce();
    expect(capture.setSize).toHaveBeenCalled();
  });

  it('keeps the Electron window id for backend validation', async () => {
    capture.discover.mockResolvedValueOnce({
      sources: [{ id: 'window:abc', kind: 'window', label: 'Editor' }],
      capabilities: { systemAudio: false },
    });
    capture.getSources.mockResolvedValue([{ id: 'window:123', name: 'Preview', thumbnail: '', appIcon: null }]);
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Window')
      ?.trigger('click');
    await ready();
    await wrapper
      .findAll('.select-option')
      .find((option) => option.text() === 'Preview')
      ?.trigger('click');
    const record = wrapper.findAll('button').find((button) => button.text().includes('Start Recording'))!;
    await record.trigger('click');
    expect(wrapper.emitted('start-recording')).toContainEqual([
      expect.objectContaining({ screenKind: 'window', screenId: 'window:123' }),
    ]);
  });

  it('keeps a failed active stop visible as an error and resets transient dropdown state', async () => {
    capture.stop.mockRejectedValueOnce(new Error('native stop failed'));
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    (wrapper.vm as any).$.setupState.isRecording = true;
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Stop ('))!
      .trigger('click');
    await ready();
    expect(wrapper.get('[role="alert"]').text()).toContain('native stop failed');
    await wrapper.get('.select-control').trigger('click');
    await wrapper.get('.select-close').trigger('click');
    expect(capture.setSize).toHaveBeenCalled();
  });
  it('routes project picker events, preference updates, and guarded region actions', async () => {
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    await wrapper.get('.preference-update').trigger('click');
    await wrapper.get('.preference-visibility').trigger('click');
    await wrapper.get('.preference-legacy-top').trigger('click');
    expect(capture.updatePreferences).toHaveBeenCalledWith({ recordingBar: { visibility: 'auto-fade' } });
    expect(capture.updatePreferences).not.toHaveBeenCalledWith({ alwaysOnTop: expect.anything() });
    await wrapper.get('[aria-label="Back"]').trigger('click');
    await wrapper.get('.project-btn').trigger('click');
    await wrapper.get('.project-toggle').trigger('click');
    expect(capture.setSize).toHaveBeenCalled();
    await wrapper.get('.project-open').trigger('click');
    expect(wrapper.emitted('open-project')).toContainEqual([{ id: 'project-1', name: 'Demo', previewSrc: 'demo.mp4' }]);
    await wrapper.get('.project-btn').trigger('click');
    await wrapper.get('.project-back').trigger('click');
    expect(wrapper.find('.project-picker-stub').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Select an area of the screen"]').attributes('disabled')).toBeDefined();
  });

  it('keeps screen and window tabs but omits source selector list on Linux', async () => {
    Object.defineProperty(window, 'capture', { configurable: true, value: { ...capture, platform: 'linux' } });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    expect(wrapper.find('.mode-tabs').exists()).toBe(true);
    expect(wrapper.find('.screen-select-controls').exists()).toBe(false);
  });

  it('supports mouse back (button 3) and forward (button 4) navigation across HUD views', async () => {
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();

    // Start on HUD
    expect(wrapper.find('.hud-body').exists()).toBe(true);
    expect(wrapper.find('.preferences-stub').exists()).toBe(false);

    // Open Preferences
    await wrapper.get('[aria-label="Preferences"]').trigger('click');
    expect(wrapper.find('.preferences-stub').exists()).toBe(true);

    // Mouse back button (button 3) -> returns to HUD
    window.dispatchEvent(new MouseEvent('mouseup', { button: 3 }));
    await ready();
    expect(wrapper.find('.preferences-stub').exists()).toBe(false);
    expect(wrapper.find('.hud-body').exists()).toBe(true);

    // Mouse forward button (button 4) -> returns to Preferences
    window.dispatchEvent(new MouseEvent('mouseup', { button: 4 }));
    await ready();
    expect(wrapper.find('.preferences-stub').exists()).toBe(true);
    expect(wrapper.find('.hud-body').exists()).toBe(false);
  });
});
