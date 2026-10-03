import { triggerPointer } from './support/pointer';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showPickerTargets: HTMLSelectElement[] = [];
const showPicker = vi.fn(function (this: HTMLSelectElement) {
  showPickerTargets.push(this);
});
const originalShowPicker = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'showPicker');

const mocks = vi.hoisted(() => ({
  capture: {
    getEditorPresets: vi.fn(),
    updateActiveEditorPreset: vi.fn(),
    selectEditorPreset: vi.fn(),
    selectQuickSnipSource: vi.fn().mockResolvedValue({ state: 'selecting' }),
    toggleQuickSnipSettings: vi.fn().mockResolvedValue(undefined),
    quickSnipStart: vi.fn(),
    quickSnipToggle: vi.fn(),
    quickSnipStop: vi.fn(),
    quickSnipCancel: vi.fn(),
    prepareRecordingSurface: vi.fn(),
    captureScreenshot: vi.fn(),
    listBackgroundLibrary: vi.fn(),
    saveScreenshot: vi.fn(),
    exportScreenshot: vi.fn(),
    configureQuickSnip: vi.fn(),
    chooseQuickSnipDevice: vi.fn(),
    reportQuickSnip: vi.fn(),
    notifyQuickSnipCropReady: vi.fn(),
    notifyQuickSnipCropIdle: vi.fn(),
    onQuickSnipConfigure: vi.fn(),
    onQuickSnipSettingsVisibility: vi.fn(() => () => {}),
    dismissQuickSnipSettings: vi.fn(),
    onQuickSnipCommand: vi.fn(),
    onQuickSnipState: vi.fn(),
  },
  recorder: null as {
    phase: { value: string };
    recordingTime: { value: string };
    systemAudioLevel: { value: number };
    recorderHoverOnlyActive: { value: boolean };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  } | null,
  nativePreviewEnabled: null as { value: boolean } | null,
  nativePreviewLevel: null as { value: number } | null,
  preferencesSettings: null as {
    recordingBar: { visibility: 'always' | 'auto-fade' | 'hover-only' };
    shortcuts: Record<string, { keys: string }>;
  } | null,
  preferencesLoad: null as ReturnType<typeof vi.fn> | null,
  onComplete: null as ((session: RecordingSessionResult) => unknown) | null,
  onStartupFailure: null as ((failure: RecordingStartFailure) => unknown) | null,
  onStartupCancelled: null as (() => unknown) | null,
  configure: null as ((configuration: QuickSnipConfiguration) => unknown) | null,
  command: null as ((command: 'start' | 'stop' | 'cancel') => unknown) | null,
  state: null as ((snapshot: { state: string }) => unknown) | null,
  offConfigure: null as ReturnType<typeof vi.fn> | null,
  offCommand: null as ReturnType<typeof vi.fn> | null,
  offState: null as ReturnType<typeof vi.fn> | null,
}));

const deviceMocks = vi.hoisted(() => ({
  cameras: vi.fn(),
  microphones: vi.fn(),
}));
vi.mock('~/api/camera-recorder', () => ({
  listBrowserCameras: deviceMocks.cameras,
}));
vi.mock('~/api/microphone-recorder', () => ({
  listBrowserMicrophones: deviceMocks.microphones,
}));

const screenshotMocks = vi.hoisted(() => ({
  screenshotState: vi.fn(),
  encodeScreenshot: vi.fn(),
  screenshotPreview: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/components/screenshot/screenshot-state', () => ({
  screenshotState: screenshotMocks.screenshotState,
}));
vi.mock('~/components/screenshot/screenshot-render', () => ({
  encodeScreenshot: screenshotMocks.encodeScreenshot,
  screenshotPreview: screenshotMocks.screenshotPreview,
}));
vi.mock('~/stores/preferences', async () => {
  const { reactive } = await import('vue');
  const settings = reactive({
    recordingBar: { visibility: 'always' as const },
    shortcuts: {} as Record<string, { keys: string }>,
  });
  const load = vi.fn().mockResolvedValue(settings);
  mocks.preferencesSettings = settings;
  mocks.preferencesLoad = load;
  return { usePreferencesStore: () => ({ settings, load }) };
});
vi.mock('~/components/hud/recorder/useNativeSystemAudioPreview', async () => {
  const { ref } = await import('vue');
  return {
    useNativeSystemAudioPreview: (enabled: { value: boolean }) => {
      const level = ref(0);
      mocks.nativePreviewEnabled = enabled;
      mocks.nativePreviewLevel = level;
      return { level };
    },
  };
});
vi.mock('~/components/hud/recorder/useRecordingController', async () => {
  const { ref } = await import('vue');
  return {
    useRecordingController: (
      onComplete: (session: RecordingSessionResult) => unknown,
      onStartupFailure: (failure: RecordingStartFailure) => unknown,
      onStartupCancelled: () => unknown,
    ) => {
      mocks.onStartupCancelled = onStartupCancelled;
      const recorder = {
        phase: ref('idle'),
        recordingTime: ref('00:00.0'),
        systemAudioLevel: ref(0),
        recorderHoverOnlyActive: ref(false),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn().mockResolvedValue(undefined),
      };
      mocks.onComplete = onComplete;
      mocks.onStartupFailure = onStartupFailure;
      mocks.recorder = recorder;
      return recorder;
    },
  };
});

import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { RecordingSessionResult, RecordingStartFailure } from '~/components/hud/recorder/recording-types';
import QuickSnipCropBar from '../apps/desktop/src/components/quick-snip/QuickSnipCropBar.vue';

const preset = {
  id: 'default',
  name: 'Default',
  protected: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    editor: { schemaVersion: 1 as const },
    devices: { micId: 'mic-1', cameraId: 'camera-1', systemAudioMode: 'off' },
    export: {
      format: 'mp4' as const,
      preset: 'medium' as const,
      frameRate: 30,
      resolution: '1080p' as const,
    },
    quickSnip: { automaticZoom: true },
  },
};
const presetDocument = {
  schemaVersion: 1 as const,
  activePresetId: preset.id,
  presets: [preset],
};
const configuration = {
  mode: 'studio' as const,
  format: 'mp4' as const,
  name: 'Quick Snip',
  preset,
  automaticZoom: true,
  screenKind: 'display' as const,
  region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
  regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  displayId: 'display-1',
  screenId: 'screen-1',
  outputRoot: '/videos/Beam/user/projects/studio',
  devices: preset.settings.devices,
} satisfies QuickSnipConfiguration;

const screenshotState = { format: 'png', quality: 0.95 } as ScreenshotState;
const screenshotDocument = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Quick Snip Screenshot',
  width: 1920,
  height: 1080,
  source: 'file:///screenshots/source.png',
  preset: preset.settings,
  state: null,
} satisfies ScreenshotDocument;
const screenshotBytes = new Uint8Array([1, 2, 3]).buffer;

const windowConfiguration = {
  ...configuration,
  screenKind: 'window' as const,
  screenId: 'portal:window',
  region: null,
} satisfies QuickSnipConfiguration;

const ButtonStub = {
  inheritAttrs: true,
  props: ['disabled', 'icon', 'loading', 'iconOnly', 'size', 'variant', 'tooltip', 'tooltipPosition'],
  emits: ['click'],
  template: `
    <button
      v-bind="$attrs"
      :class="['btn', 'btn-' + variant, 'btn-' + size]"
      :disabled="disabled || loading"
      @click="$emit('click', $event)"
    >
      <span v-if="icon && !$slots.icon && !loading" class="btn-icon-wrapper"><component :is="icon" /></span>
      <span v-if="$slots.icon && !loading" class="btn-icon-wrapper"><slot name="icon" /></span>
      <span v-if="!iconOnly && $slots.default" class="btn-content">
        <span class="btn-content-label"><slot /></span>
      </span>
    </button>
  `,
};
const mountBar = async (initialConfiguration: QuickSnipConfiguration = configuration) => {
  const wrapper = mount(QuickSnipCropBar, {
    attachTo: document.body,
    global: { stubs: { Button: ButtonStub } },
  });
  await mocks.configure?.(initialConfiguration);
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks.capture)) mock.mockReset();
  mocks.capture.onQuickSnipSettingsVisibility.mockReturnValue(() => {});
  deviceMocks.cameras.mockResolvedValue([{ id: 'camera:chromium:usb', label: 'USB camera', isDefault: true }]);
  deviceMocks.microphones.mockResolvedValue([{ id: 'mic-1', label: 'USB mic', isDefault: true }]);
  mocks.capture.chooseQuickSnipDevice.mockResolvedValue(null);
  showPickerTargets.length = 0;
  Object.defineProperty(HTMLSelectElement.prototype, 'showPicker', {
    configurable: true,
    writable: true,
    value: showPicker,
  });
  mocks.recorder = null;
  if (mocks.preferencesSettings) {
    mocks.preferencesSettings.recordingBar.visibility = 'always';
    mocks.preferencesSettings.shortcuts = {};
  }
  mocks.nativePreviewEnabled = null;
  mocks.nativePreviewLevel = null;
  mocks.onComplete = null;
  mocks.onStartupFailure = null;
  mocks.configure = null;
  mocks.command = null;
  mocks.state = null;
  mocks.offConfigure = null;
  mocks.offCommand = null;
  mocks.offState = null;
  mocks.capture.getEditorPresets.mockResolvedValue(presetDocument);
  mocks.capture.updateActiveEditorPreset.mockResolvedValue(presetDocument);
  mocks.capture.selectEditorPreset.mockResolvedValue(presetDocument);
  mocks.capture.quickSnipStart.mockResolvedValue({ state: 'preparing' });
  mocks.capture.quickSnipToggle.mockResolvedValue({ state: 'preparing' });
  mocks.capture.quickSnipStop.mockResolvedValue({ state: 'finalizing' });
  mocks.capture.quickSnipCancel.mockResolvedValue({ state: 'canceled' });
  mocks.capture.prepareRecordingSurface.mockResolvedValue(undefined);
  mocks.capture.captureScreenshot.mockResolvedValue(screenshotDocument);
  mocks.capture.listBackgroundLibrary.mockResolvedValue([]);
  mocks.capture.saveScreenshot.mockResolvedValue(undefined);
  mocks.capture.exportScreenshot.mockResolvedValue('/screenshots/copied.png');
  mocks.capture.configureQuickSnip.mockResolvedValue({ state: 'selecting' });
  mocks.capture.reportQuickSnip.mockResolvedValue({ state: 'recording' });
  screenshotMocks.screenshotState.mockReturnValue(screenshotState);
  screenshotMocks.encodeScreenshot.mockResolvedValue(screenshotBytes);
  mocks.capture.onQuickSnipConfigure.mockImplementation(
    (listener: (value: QuickSnipConfiguration) => unknown) => {
      mocks.configure = listener;
      mocks.offConfigure = vi.fn();
      return mocks.offConfigure;
    },
  );
  mocks.capture.onQuickSnipCommand.mockImplementation(
    (listener: (value: 'start' | 'stop' | 'cancel') => unknown) => {
      mocks.command = listener;
      mocks.offCommand = vi.fn();
      return mocks.offCommand;
    },
  );
  mocks.capture.onQuickSnipState.mockImplementation((listener: (value: { state: string }) => unknown) => {
    mocks.state = listener;
    mocks.offState = vi.fn();
    return mocks.offState;
  });
});

afterEach(() => {
  if (originalShowPicker) {
    Object.defineProperty(HTMLSelectElement.prototype, 'showPicker', originalShowPicker);
  } else {
    Reflect.deleteProperty(HTMLSelectElement.prototype, 'showPicker');
  }
});

describe('QuickSnipCropBar', () => {
  it.each(['recording', 'paused'])(
    'confirms and discards an Instant %s before restarting the same job',
    async (phase) => {
      const wrapper = await mountBar({ ...configuration, mode: 'instant' });
      await mocks.command?.('start');
      await flushPromises();
      mocks.recorder!.phase.value = phase;
      await mocks.state?.({ state: 'recording' });
      await flushPromises();
      mocks.recorder!.start.mockClear();
      mocks.recorder!.cancel.mockImplementation(async () => {
        mocks.recorder!.phase.value = 'idle';
      });
      mocks.capture.reportQuickSnip.mockResolvedValue({ state: 'preparing' });
      await wrapper.get('button[aria-label="Restart recording"]').trigger('click');
      expect(mocks.recorder!.cancel).not.toHaveBeenCalled();
      await wrapper.get('[role="alertdialog"]').findAll('button')[1]!.trigger('click');
      await flushPromises();
      expect(mocks.recorder!.cancel).toHaveBeenCalledOnce();
      expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
        type: 'restarting',
        name: configuration.name,
      });
      expect(mocks.recorder!.start).toHaveBeenCalledWith(
        expect.objectContaining({
          screenId: configuration.screenId,
          countdownSeconds: 0,
        }),
      );
      expect(mocks.capture.quickSnipStop).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it('keeps a failed cleanup from starting a second Instant recording', async () => {
    const wrapper = await mountBar({ ...configuration, mode: 'instant' });
    await mocks.command?.('start');
    await flushPromises();
    mocks.recorder!.phase.value = 'recording';
    await flushPromises();
    mocks.recorder!.start.mockClear();
    mocks.capture.reportQuickSnip.mockClear();
    await wrapper.get('button[aria-label="Restart recording"]').trigger('click');
    await wrapper.get('[role="alertdialog"]').findAll('button')[1]!.trigger('click');
    await flushPromises();
    expect(mocks.recorder!.cancel).toHaveBeenCalledOnce();
    expect(mocks.recorder!.start).not.toHaveBeenCalled();
    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not restart a job canceled while its native discard is pending', async () => {
    const wrapper = await mountBar({ ...configuration, mode: 'instant' });
    await mocks.command?.('start');
    await flushPromises();
    mocks.recorder!.phase.value = 'recording';
    await flushPromises();
    mocks.recorder!.start.mockClear();
    let finish!: () => void;
    mocks.recorder!.cancel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await wrapper.get('button[aria-label="Restart recording"]').trigger('click');
    await wrapper.get('[role="alertdialog"]').findAll('button')[1]!.trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    mocks.recorder!.phase.value = 'idle';
    finish();
    await flushPromises();
    expect(mocks.recorder!.start).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('applies live recording-bar visibility after selection and tracks pointer hover', async () => {
    mocks.preferencesSettings!.recordingBar.visibility = 'auto-fade';
    const wrapper = await mountBar();
    let cropBar = wrapper.get('.crop-bar');

    expect(mocks.preferencesLoad).toHaveBeenCalledOnce();
    expect(cropBar.classes()).not.toContain('auto-fade');
    expect(cropBar.classes()).not.toContain('hover-only');
    expect(wrapper.find('.device-controls').exists()).toBe(true);

    await mocks.state?.({ state: 'selecting' });
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).not.toContain('auto-fade');
    expect(wrapper.find('.device-controls').exists()).toBe(true);

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    await mocks.state?.({ state: 'recording' });
    await wrapper.vm.$nextTick();
    cropBar = wrapper.get('.recorder-bar');
    expect(wrapper.find('.preset-field').exists()).toBe(false);
    expect(cropBar.findAll('button')).toHaveLength(4);
    expect(cropBar.classes()).toContain('auto-fade');
    await triggerPointer(cropBar, 'pointerenter');
    expect(cropBar.classes()).toContain('pointer-over');
    await triggerPointer(cropBar, 'pointerleave');
    expect(cropBar.classes()).not.toContain('pointer-over');

    mocks.preferencesSettings!.recordingBar.visibility = 'hover-only';
    mocks.recorder!.recorderHoverOnlyActive.value = true;
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).not.toContain('auto-fade');
    expect(cropBar.classes()).toContain('hover-only');

    mocks.recorder!.recorderHoverOnlyActive.value = false;
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).toContain('hover-only');
    mocks.preferencesSettings!.recordingBar.visibility = 'always';
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).not.toContain('hover-only');
    mocks.preferencesSettings!.recordingBar.visibility = 'hover-only';
    mocks.recorder!.phase.value = 'idle';
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).not.toContain('hover-only');
    wrapper.unmount();
  });

  it('previews system audio while selection is active, then uses the recorder level', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    expect(mocks.nativePreviewEnabled?.value).toBe(false);

    await mocks.configure?.(configuration);
    await flushPromises();
    expect(mocks.nativePreviewEnabled?.value).toBe(false);

    await mocks.state?.({ state: 'selecting' });
    await wrapper.vm.$nextTick();
    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('on');
    await wrapper.get('button[aria-label="System audio"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(true);

    mocks.nativePreviewLevel!.value = 0.73;
    await wrapper.vm.$nextTick();
    expect(
      wrapper.get<HTMLElement>('button[aria-label="System audio"] .level-bar-fill').element.style.height,
    ).toBe('73%');

    await mocks.state?.({ state: 'processing' });
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(false);
    await mocks.state?.({ state: 'selecting' });
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(true);

    mocks.recorder!.phase.value = 'starting';
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(false);
    mocks.recorder!.phase.value = 'recording';
    mocks.recorder!.systemAudioLevel.value = 0.42;
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(false);
    expect(
      wrapper.get<HTMLElement>('button[aria-label="System audio"] .level-bar-fill').element.style.height,
    ).toBe('42%');

    wrapper.unmount();
  });

  it('offers one Screenshot action that captures and copies without opening the editor', async () => {
    const wrapper = await mountBar();
    await wrapper.get('[aria-label="Image"]').trigger('click');
    await flushPromises();

    mocks.capture.quickSnipStart.mockClear();
    await wrapper.get('.capture-actions button').trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'screenshot', screenshotAction: 'copy' }),
    );

    expect(wrapper.findAll('.capture-actions button').map((button) => button.text())).toEqual(['']);
    expect(wrapper.find('.controls-row .control-divider').exists()).toBe(false);
    expect(wrapper.get('.capture-actions button').attributes('title')).toContain('Screenshot');

    wrapper.unmount();
  });

  it('returns a cancelled screenshot to the selecting controls without saving or showing an export failure', async () => {
    const wrapper = await mountBar({ ...configuration, mode: 'screenshot' });
    mocks.capture.captureScreenshot.mockResolvedValueOnce(null);
    mocks.capture.reportQuickSnip.mockImplementationOnce(async () => {
      mocks.state?.({ state: 'selecting' });
      return { state: 'selecting' };
    });
    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'capture-cancelled',
      name: configuration.name,
    });
    expect(mocks.capture.saveScreenshot).not.toHaveBeenCalled();
    expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
    expect(wrapper.get('.capture-actions button').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[aria-label="Image"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('select').exists()).toBe(false);
    await wrapper.get('.capture-actions button').trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'screenshot' }),
    );
    wrapper.unmount();
  });

  it('does not reopen a screenshot selection after the Quick Snip was canceled', async () => {
    const wrapper = await mountBar({ ...configuration, mode: 'screenshot' });
    let resolve!: (value: null) => void;
    mocks.capture.captureScreenshot.mockReturnValueOnce(
      new Promise<null>((done) => {
        resolve = done;
      }),
    );
    await mocks.command?.('start');
    await flushPromises();
    await mocks.command?.('cancel');
    resolve(null);
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'capture-cancelled' }),
    );
    wrapper.unmount();
  });

  it('reports a clean Studio portal cancellation for the current job', async () => {
    const wrapper = await mountBar();
    await mocks.command?.('start');
    await flushPromises();
    await mocks.onStartupCancelled?.();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'capture-cancelled',
      name: configuration.name,
    });
    wrapper.unmount();
  });

  it('captures and copies a native screenshot from the shortcut command', async () => {
    const screenshotConfiguration = {
      ...configuration,
      mode: 'screenshot' as const,
      screenshotAction: 'copy' as const,
      excludedWindowHandle: 'native-window',
    } satisfies QuickSnipConfiguration;
    const wrapper = await mountBar(screenshotConfiguration);
    mocks.capture.reportQuickSnip.mockClear();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.capture.prepareRecordingSurface).toHaveBeenCalledOnce();
    expect(mocks.capture.captureScreenshot).toHaveBeenCalledWith({
      screenKind: 'display',
      screenId: 'screen-1',
      region: configuration.region,
      excludedWindowHandles: ['native-window'],
    });
    expect(screenshotMocks.screenshotState).toHaveBeenCalledWith(screenshotDocument, []);
    expect(mocks.capture.saveScreenshot).toHaveBeenCalledWith(screenshotDocument.id, screenshotState);
    expect(screenshotMocks.encodeScreenshot).toHaveBeenCalledWith(
      screenshotDocument.source,
      screenshotState,
      expect.objectContaining({ onRendered: expect.any(Function) }),
    );
    expect(mocks.capture.exportScreenshot).toHaveBeenCalledWith(
      screenshotDocument.id,
      screenshotBytes,
      'png',
      true,
    );
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'screenshot',
      name: configuration.name,
      screenshotId: screenshotDocument.id,
    });
    expect(mocks.recorder?.start).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('hands an editor screenshot capture to the native open flow without exporting a clipboard image', async () => {
    const screenshotConfiguration = {
      ...configuration,
      mode: 'screenshot' as const,
      screenshotAction: 'edit' as const,
    } satisfies QuickSnipConfiguration;
    const wrapper = await mountBar(screenshotConfiguration);
    mocks.capture.reportQuickSnip.mockClear();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.capture.captureScreenshot).toHaveBeenCalledOnce();
    expect(mocks.capture.saveScreenshot).not.toHaveBeenCalled();
    expect(screenshotMocks.encodeScreenshot).not.toHaveBeenCalled();
    expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'screenshot',
      name: configuration.name,
      screenshotId: screenshotDocument.id,
    });

    wrapper.unmount();
  });

  it('routes the Start and Stop button through explicit Quick Snip IPC and keeps shortcut commands recorder-owned', async () => {
    const wrapper = await mountBar();
    const startButton = wrapper.find('.capture-actions button');
    expect(startButton).toBeDefined();

    mocks.capture.configureQuickSnip.mockClear();
    mocks.capture.quickSnipToggle.mockClear();
    mocks.capture.quickSnipStart.mockClear();
    await startButton!.trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'studio', screenshotAction: 'copy' }),
    );
    expect(mocks.capture.configureQuickSnip).not.toHaveBeenCalled();
    expect(mocks.capture.quickSnipToggle).not.toHaveBeenCalled();

    mocks.capture.quickSnipStart.mockClear();
    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();
    expect(mocks.recorder?.start).toHaveBeenCalledOnce();

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    const stopButton = wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Stop recording');
    expect(stopButton).toBeDefined();
    mocks.capture.quickSnipToggle.mockClear();
    mocks.capture.quickSnipStop.mockClear();
    await stopButton!.trigger('click');
    expect(mocks.capture.quickSnipStop).toHaveBeenCalledOnce();
    expect(mocks.capture.quickSnipToggle).not.toHaveBeenCalled();

    await mocks.command?.('stop');
    await flushPromises();
    expect(mocks.recorder?.stop).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('announces renderer readiness after all Quick Snip IPC listeners are installed', () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });

    expect(mocks.capture.notifyQuickSnipCropReady).toHaveBeenCalledOnce();
    expect(mocks.capture.notifyQuickSnipCropReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.capture.onQuickSnipConfigure.mock.invocationCallOrder[0],
    );
    expect(mocks.capture.notifyQuickSnipCropReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.capture.onQuickSnipCommand.mock.invocationCallOrder[0],
    );
    expect(mocks.capture.notifyQuickSnipCropReady.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.capture.onQuickSnipState.mock.invocationCallOrder[0],
    );

    wrapper.unmount();
  });

  it('passes a structured-cloneable recorder configuration across the Electron boundary', async () => {
    const wrapper = await mountBar();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledOnce();
    const startConfiguration = mocks.recorder!.start.mock.calls[0]![0];
    expect(structuredClone(startConfiguration)).toEqual(
      expect.objectContaining({ region: configuration.region }),
    );

    wrapper.unmount();
  });

  it('passes a Portal window capture without a display region and handles command start and stop locally', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    await mocks.configure?.(windowConfiguration);
    await flushPromises();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({
        screenKind: 'window',
        screenId: 'portal:window',
        region: null,
      }),
    );
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    await mocks.command?.('stop');
    await flushPromises();

    expect(mocks.recorder?.stop).toHaveBeenCalledOnce();
    expect(mocks.capture.quickSnipStop).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('keeps the incoming configuration unchanged while selecting recording settings', async () => {
    const wrapper = await mountBar();
    const source = structuredClone(configuration);

    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('mic-1');
    await wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();

    expect(configuration).toEqual(source);
    wrapper.unmount();
  });

  it('ignores start commands and button clicks before configuration arrives', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });

    await mocks.command?.('start');
    await wrapper.get('.capture-actions button').trigger('click');
    await flushPromises();

    expect(mocks.recorder?.start).not.toHaveBeenCalled();
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();
    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('uses safe device defaults and no excluded handles when IDs are absent', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    const configurationWithoutIds = {
      ...configuration,
      screenId: undefined,
      excludedWindowHandle: undefined,
      preset: {
        ...preset,
        settings: { ...preset.settings, devices: {} },
      },
      devices: {},
    } satisfies QuickSnipConfiguration;
    await mocks.configure?.(configurationWithoutIds);
    await flushPromises();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({
        screenId: undefined,
        cameraId: 'default',
        microphoneId: 'default',
        excludedWindowHandles: [],
      }),
    );

    wrapper.unmount();
  });

  it('uses job device overrides instead of the preset device values', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    const overriddenConfiguration = {
      ...configuration,
      preset: {
        ...preset,
        settings: {
          ...preset.settings,
          devices: {
            micId: 'preset-mic',
            cameraId: 'preset-camera',
            systemAudioMode: 'off' as const,
          },
        },
      },
      devices: {
        micId: 'job-mic',
        cameraId: 'job-camera',
        systemAudioMode: 'on' as const,
      },
      excludedWindowHandle: 'native-handle',
    } satisfies QuickSnipConfiguration;
    await mocks.configure?.(overriddenConfiguration);
    await flushPromises();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraId: 'job-camera',
        microphoneId: 'job-mic',
        systemAudio: true,
        excludedWindowHandles: ['native-handle'],
      }),
    );

    wrapper.unmount();
  });

  it('starts Instant capture in the output root supplied by its current configuration', async () => {
    const instantConfiguration = {
      ...configuration,
      mode: 'instant' as const,
      outputRoot: '/videos/Beam/user/projects/instant',
    } satisfies QuickSnipConfiguration;
    const wrapper = await mountBar(instantConfiguration);

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({ outputRoot: instantConfiguration.outputRoot }),
    );
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('normalizes device IDs when microphone and camera are re-enabled', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    const disabledConfiguration = {
      ...configuration,
      preset: {
        ...preset,
        settings: {
          ...preset.settings,
          devices: {
            micId: 'no-audio',
            cameraId: 'off',
            systemAudioMode: 'off' as const,
          },
        },
      },
      devices: {
        micId: 'no-audio',
        cameraId: 'off',
        systemAudioMode: 'off' as const,
      },
    } satisfies QuickSnipConfiguration;
    await mocks.configure?.(disabledConfiguration);
    await flushPromises();

    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('mic-1');
    await wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('camera:chromium:usb');
    await wrapper.get('[aria-label="Camera"]').trigger('click');
    await flushPromises();
    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({ cameraId: 'camera:chromium:usb', microphoneId: 'mic-1' }),
    );

    wrapper.unmount();
  });

  it('keeps capture and other device controls disabled until the chosen device is saved', async () => {
    const wrapper = await mountBar();
    let finish!: () => void;
    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('no-audio');
    mocks.capture.updateActiveEditorPreset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(presetDocument);
        }),
    );
    await wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.capture-actions button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Camera"]').attributes('disabled')).toBeDefined();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledOnce();
    finish();
    await flushPromises();
    expect(wrapper.get('.capture-actions button').attributes('disabled')).toBeUndefined();
    await wrapper.get('.capture-actions button').trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('reports a current synchronization failure from a control change', async () => {
    const wrapper = await mountBar();
    const failure = new Error('shortcut configuration failed');
    mocks.capture.configureQuickSnip.mockRejectedValueOnce(failure);
    mocks.capture.reportQuickSnip.mockClear();

    await wrapper.get('button[aria-label="Image"]').trigger('click');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'failed',
      error: failure.message,
    });

    wrapper.unmount();
  });

  it('suppresses a stale synchronization failure after a cancel command', async () => {
    const wrapper = await mountBar();
    let rejectConfigure!: (reason: unknown) => void;
    const pendingConfigure = new Promise<unknown>((_resolve, reject) => {
      rejectConfigure = reject;
    });
    mocks.capture.configureQuickSnip.mockReturnValueOnce(pendingConfigure);
    mocks.capture.reportQuickSnip.mockClear();

    const zoomChange = wrapper.get('button[aria-label="Image"]').trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    rejectConfigure(new Error('stale shortcut configuration failed'));
    await Promise.all([zoomChange, flushPromises()]);

    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('starts even when the active preset is absent from the preset document', async () => {
    const document = {
      schemaVersion: 1 as const,
      activePresetId: 'missing',
      presets: [preset],
    };
    mocks.capture.getEditorPresets.mockResolvedValue(document);
    const wrapper = await mountBar();
    mocks.capture.updateActiveEditorPreset.mockClear();

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(mocks.recorder?.start).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  it('does not persist or synchronize settings while applying an incoming configuration', async () => {
    const wrapper = await mountBar();
    const incomingPreset = {
      ...preset,
      id: 'incoming',
      name: 'Incoming',
      settings: {
        ...preset.settings,
        devices: {
          micId: 'incoming-mic',
          cameraId: 'incoming-camera',
          systemAudioMode: 'on' as const,
        },
        quickSnip: { automaticZoom: false },
      },
    };
    const incoming = {
      ...configuration,
      mode: 'instant' as const,
      automaticZoom: false,
      preset: incomingPreset,
      devices: incomingPreset.settings.devices,
    } satisfies QuickSnipConfiguration;

    mocks.capture.getEditorPresets.mockClear();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();
    await mocks.configure?.(incoming);
    await flushPromises();

    expect(wrapper.get('[aria-label="Video"]').attributes('aria-pressed')).toBe('true');
    expect(mocks.capture.getEditorPresets).not.toHaveBeenCalled();
    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(mocks.capture.configureQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reports a failed Quick Snip when settings persistence rejects before recorder startup', async () => {
    const wrapper = await mountBar();
    const failure = new Error('preset persistence failed');
    mocks.capture.updateActiveEditorPreset.mockRejectedValueOnce(failure);

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).not.toHaveBeenCalled();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'failed',
      error: failure.message,
    });

    wrapper.unmount();
  });

  it('reports explicit Start failures and restores the Start control', async () => {
    const wrapper = await mountBar();
    const failure = 'native Quick Snip start failed';
    mocks.capture.quickSnipStart.mockRejectedValueOnce(failure);
    const startButton = wrapper.find('.capture-actions button')!;

    await startButton.trigger('click');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'failed',
      error: failure,
    });
    expect(startButton.attributes('disabled')).toBeUndefined();

    wrapper.unmount();
  });

  it('reports recorder startup failures from shortcut commands', async () => {
    const wrapper = await mountBar();
    const failure = new Error('native recorder start failed');
    mocks.recorder!.start.mockRejectedValueOnce(failure);

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'failed',
      error: failure.message,
    });

    wrapper.unmount();
  });

  it('uses the main-process cancellation path for the Cancel button', async () => {
    const wrapper = await mountBar();
    await wrapper.get('[aria-label="Cancel"]').trigger('click');
    await flushPromises();

    expect(mocks.capture.quickSnipCancel).toHaveBeenCalledOnce();
    expect(mocks.recorder?.cancel).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('handles a cancel command locally without recursively invoking Quick Snip cancellation', async () => {
    const wrapper = await mountBar();
    mocks.capture.quickSnipCancel.mockImplementation(() => {
      mocks.command?.('cancel');
      return Promise.resolve({ state: 'canceled' });
    });

    await mocks.command?.('cancel');
    await flushPromises();

    expect(mocks.capture.quickSnipCancel).not.toHaveBeenCalled();
    expect(mocks.recorder?.cancel).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  it('does not start a recorder after cancel invalidates a pending startup', async () => {
    const wrapper = await mountBar();
    let resolvePresetRead!: (document: typeof presetDocument) => void;
    const pendingPresetRead = new Promise<typeof presetDocument>((resolve) => {
      resolvePresetRead = resolve;
    });
    mocks.capture.getEditorPresets.mockReturnValue(pendingPresetRead);

    await mocks.command?.('start');
    await flushPromises();
    await mocks.command?.('cancel');
    await flushPromises();
    expect(mocks.recorder?.cancel).toHaveBeenCalledOnce();

    resolvePresetRead(presetDocument);
    await flushPromises();
    expect(mocks.recorder?.start).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('does not start after cancel invalidates a queued settings synchronization', async () => {
    const wrapper = await mountBar();
    let resolvePresetRead!: (document: typeof presetDocument) => void;
    const pendingPresetRead = new Promise<typeof presetDocument>((resolve) => {
      resolvePresetRead = resolve;
    });
    mocks.capture.getEditorPresets.mockReturnValue(pendingPresetRead);

    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('no-audio');
    const microphoneChange = wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    await mocks.command?.('start');
    await flushPromises();
    await mocks.command?.('cancel');
    await flushPromises();

    resolvePresetRead(presetDocument);
    await Promise.all([microphoneChange, flushPromises()]);
    expect(mocks.recorder?.start).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('does not invoke Quick Snip start after a canceled button action resumes', async () => {
    const wrapper = await mountBar();
    let resolveConfigure!: (snapshot: { state: 'selecting' }) => void;
    const pendingConfigure = new Promise<{ state: 'selecting' }>((resolve) => {
      resolveConfigure = resolve;
    });
    mocks.capture.configureQuickSnip.mockReturnValueOnce(pendingConfigure);

    mocks.capture.chooseQuickSnipDevice.mockResolvedValueOnce('no-audio');
    const modeChange = wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    const startButton = wrapper.find('.capture-actions button')!;
    const pendingStart = startButton.trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    resolveConfigure({ state: 'selecting' });
    await Promise.all([modeChange, pendingStart, flushPromises()]);

    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reports completed and failed recorder callbacks to the main process', async () => {
    const wrapper = await mountBar();
    const session = {
      sessionId: 'session-1',
      projectId: 'project-1',
      videoSrc: 'file:///videos/quick-snip.mp4',
    } satisfies RecordingSessionResult;

    mocks.onComplete?.(session);
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'completed',
      session,
    });

    mocks.capture.reportQuickSnip.mockClear();
    const failure = {
      stage: 'start-native',
      message: 'native capture failed',
      nativePrepared: true,
      nativeStarted: false,
      camera: 'disabled',
      microphone: 'prepared',
      systemAudio: 'disabled',
    } satisfies RecordingStartFailure;
    mocks.onStartupFailure?.(failure);
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({
      type: 'failed',
      error: failure.message,
    });

    wrapper.unmount();
  });

  it('uses native title attributes and never mounts a custom tooltip for Crop Bar actions', async () => {
    const wrapper = await mountBar();
    const titles = wrapper
      .findAll('button')
      .map((button) => button.attributes('title'))
      .filter(Boolean);

    expect(titles).toEqual(expect.arrayContaining(['Microphone', 'System audio', 'Camera', 'Cancel']));
    expect(wrapper.findAll('[tooltip]')).toHaveLength(0);
    expect(wrapper.findAll('.tooltip-wrapper')).toHaveLength(0);

    wrapper.unmount();
  });

  it('removes all IPC listeners on unmount', async () => {
    const wrapper = await mountBar();
    wrapper.unmount();

    expect(mocks.offConfigure).toHaveBeenCalledOnce();
    expect(mocks.offCommand).toHaveBeenCalledOnce();
    expect(mocks.offState).toHaveBeenCalledOnce();
  });

  it('shows the real recorder duration and switches to HH:MM:SS after one hour', async () => {
    const wrapper = await mountBar();
    mocks.recorder!.phase.value = 'recording';
    mocks.state?.({ state: 'recording' });
    mocks.recorder!.recordingTime.value = '01:02.3';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.recording-time').text()).toBe('01:02');

    mocks.recorder!.recordingTime.value = '60:00.0';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.recording-time').text()).toBe('01:00:00');
    wrapper.unmount();
  });
  it('opens the native camera menu on right-click and applies the chosen source to the preset and recording', async () => {
    const wrapper = await mountBar();
    let resolveMenu!: (id: string) => void;
    mocks.capture.chooseQuickSnipDevice.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveMenu = resolve;
      }),
    );
    const cameraButton = wrapper.get('button[aria-label="Camera"]');
    const context = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    cameraButton.element.dispatchEvent(context);
    await flushPromises();
    expect(context.defaultPrevented).toBe(true);
    expect(mocks.capture.chooseQuickSnipDevice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'camera' }),
    );
    expect(cameraButton.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Camera"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Recording settings"]').attributes('disabled')).toBeDefined();
    resolveMenu('camera:chromium:usb');
    await flushPromises();
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: expect.objectContaining({ cameraId: 'camera:chromium:usb' }),
      }),
    );
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        devices: expect.objectContaining({ cameraId: 'camera:chromium:usb' }),
      }),
    );
    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.recorder!.start).toHaveBeenCalledWith(
      expect.objectContaining({ cameraId: 'camera:chromium:usb' }),
    );
    wrapper.unmount();
  });
});

it('releases canceled hidden controls only after recorder cleanup is finished', async () => {
  const wrapper = await mountBar();
  mocks.recorder!.phase.value = 'finalizing';
  mocks.state?.({ state: 'canceled' });
  await flushPromises();
  expect(mocks.capture.notifyQuickSnipCropIdle).not.toHaveBeenCalled();
  mocks.recorder!.phase.value = 'idle';
  await flushPromises();
  expect(mocks.capture.notifyQuickSnipCropIdle).toHaveBeenCalledOnce();
  wrapper.unmount();
});
it('preserves selecting and processing controls even when their recorder is idle', async () => {
  const wrapper = await mountBar();
  for (const state of ['selecting', 'processing', 'recording']) {
    mocks.state?.({ state });
    await flushPromises();
  }
  expect(mocks.capture.notifyQuickSnipCropIdle).not.toHaveBeenCalled();
  wrapper.unmount();
});
it('a new configuration clears the previous terminal cleanup state', async () => {
  const wrapper = await mountBar();
  mocks.recorder!.phase.value = 'finalizing';
  mocks.state?.({ state: 'canceled' });
  await flushPromises();
  mocks.configure?.({ ...configuration, name: 'new job' });
  mocks.recorder!.phase.value = 'idle';
  await flushPromises();
  expect(mocks.capture.notifyQuickSnipCropIdle).not.toHaveBeenCalled();
  wrapper.unmount();
});
it('rapid source-tab changes keep every control enabled and never show capture loading', async () => {
  let finish: (value: unknown) => void = () => {};
  mocks.capture.selectQuickSnipSource.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const wrapper = await mountBar();
  const controls = wrapper
    .findAll('button')
    .filter((button) => ['Full screen', 'Region', 'Window'].includes(button.attributes('aria-label')));
  for (const button of controls) {
    await button.trigger('click');
    await flushPromises();
    expect(button.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('.capture-actions .icon-spin').exists()).toBe(false);
  }
  expect(mocks.capture.selectQuickSnipSource).toHaveBeenCalledTimes(3);
  finish({ state: 'selecting' });
  wrapper.unmount();
});
it('waits for an in-flight screenshot after cancellation before releasing its renderer', async () => {
  let resolveCapture: (value: null) => void = () => {};
  mocks.capture.captureScreenshot.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
  );
  const wrapper = await mountBar({ ...configuration, mode: 'screenshot' });
  mocks.command?.('start');
  await flushPromises();
  expect(mocks.capture.captureScreenshot).toHaveBeenCalledOnce();
  mocks.command?.('cancel');
  mocks.state?.({ state: 'canceled' });
  await flushPromises();
  expect(mocks.capture.notifyQuickSnipCropIdle).not.toHaveBeenCalled();
  resolveCapture(null);
  await flushPromises();
  expect(mocks.capture.notifyQuickSnipCropIdle).toHaveBeenCalledOnce();
  wrapper.unmount();
});
