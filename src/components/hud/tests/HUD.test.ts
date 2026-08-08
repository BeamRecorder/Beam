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
    template:
      '<div class="preferences-stub"><button class="preference-update" @click="$emit(\'update:countdown-seconds\', 10)"/><button class="preference-visibility" @click="$emit(\'update:recording-bar-visibility\', \'auto-fade\')"/><button @click="$emit(\'close\')">Return</button></div>',
  },
  CameraPreviewOverlay: { template: '<div class="camera-preview-stub" />' },
};
const ready = async () => {
  await flushPromises();
  await Promise.resolve();
};
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

describe('HUD', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
        configurable: true,
      });
    } else {
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue({ getTracks: () => [] } as any);
    }
    Object.values(capture).forEach((mock) => mock.mockReset());
    Object.values(browserCameraMock).forEach((mock) => mock.mockReset());
    Object.values(browserMicrophoneMock).forEach((mock) => mock.mockReset());
    Object.values(browserSystemAudioMock).forEach((mock) => mock.mockReset());
    capture.getPreferences.mockResolvedValue({
      schemaVersion: 2,
      theme: 'system',
      recordingBar: { visibility: 'always' },
      devices: { cameraId: 'camera:chromium:device-1', micId: 'microphone:chromium:device-1', systemAudioMode: 'off' },
      shortcuts: {},
      backgroundPresets: { colors: [], gradients: [] },
      extras: {},
    });
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
    expect(wrapper.get('.editor-preparing-hud').text()).toContain('Loading the timeline');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('65');
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
      schemaVersion: 2,
      theme: 'system',
      recordingBar: { visibility: 'always' },
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

    await wrapper.get('.capture-error-copy').trigger('click');
    await ready();
    expect(writeText).toHaveBeenCalledWith(String(cloneError));
  });

  it('copies discovery errors through the clipboard fallback and clears copied state', async () => {
    capture.discover.mockRejectedValueOnce(new Error('discover failed'));
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) });
    const wrapper = mount(HUD, { global: { stubs } });
    await ready();
    await wrapper.get('.capture-error-copy').trigger('click');
    await ready();
    expect(writeText).toHaveBeenCalledWith('discover failed');
    expect(wrapper.get('.capture-error-copy').text()).toContain('Copied');
    vi.advanceTimersByTime(2_000);
    await ready();
    expect(wrapper.get('.capture-error-copy').text()).toContain('Copy error');
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
      schemaVersion: 2,
      theme: 'system',
      recordingBar: { visibility: 'auto-fade' },
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
    expect(capture.updatePreferences).toHaveBeenCalledWith({ recordingBar: { visibility: 'auto-fade' } });
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
});
