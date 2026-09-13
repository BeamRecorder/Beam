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
    onQuickSnipConfigure: vi.fn(),
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

const deviceMocks = vi.hoisted(() => ({ cameras: vi.fn(), microphones: vi.fn() }));
vi.mock('~/api/camera-recorder', () => ({ listBrowserCameras: deviceMocks.cameras }));
vi.mock('~/api/microphone-recorder', () => ({ listBrowserMicrophones: deviceMocks.microphones }));

const screenshotMocks = vi.hoisted(() => ({
  screenshotState: vi.fn(),
  encodeScreenshot: vi.fn(),
  screenshotPreview: vi.fn(),
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('~/components/video-editor/screenshot/screenshot-state', () => ({
  screenshotState: screenshotMocks.screenshotState,
}));
vi.mock('~/components/video-editor/screenshot/screenshot-render', () => ({
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
import { setCurrentLocale } from '~/i18n';
import QuickSnipCropBar from '../src/components/quick-snip/QuickSnipCropBar.vue';

const preset = {
  id: 'default',
  name: 'Default',
  protected: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    editor: { schemaVersion: 1 as const },
    devices: { micId: 'mic-1', cameraId: 'camera-1', systemAudioMode: 'off' },
    export: { format: 'mp4' as const, preset: 'medium' as const, frameRate: 30, resolution: '1080p' as const },
    quickSnip: { automaticZoom: true },
  },
};
const presetDocument = { schemaVersion: 1 as const, activePresetId: preset.id, presets: [preset] };
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
  props: ['disabled', 'icon', 'loading', 'iconOnly', 'size', 'variant'],
  emits: ['click'],
  template: `
    <button
      v-bind="$attrs"
      :class="['btn', 'btn-' + variant, 'btn-' + size]"
      :disabled="disabled || loading"
      @click="$emit('click')"
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
  deviceMocks.cameras.mockResolvedValue([{ id: 'camera:chromium:usb', label: 'USB camera', isDefault: true }]);
  deviceMocks.microphones.mockResolvedValue([]);
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
  mocks.capture.onQuickSnipConfigure.mockImplementation((listener: (value: QuickSnipConfiguration) => unknown) => {
    mocks.configure = listener;
    mocks.offConfigure = vi.fn();
    return mocks.offConfigure;
  });
  mocks.capture.onQuickSnipCommand.mockImplementation((listener: (value: 'start' | 'stop' | 'cancel') => unknown) => {
    mocks.command = listener;
    mocks.offCommand = vi.fn();
    return mocks.offCommand;
  });
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
  it('keeps preset selection but exposes no preset CRUD controls', async () => {
    const wrapper = await mountBar();

    expect(wrapper.findAll('select')).toHaveLength(1);
    expect(wrapper.get('.capture-modes').attributes('aria-label')).toBe('Mode');
    expect(
      wrapper
        .get('.capture-modes')
        .findAll('button')
        .map((button) => button.attributes('aria-label')),
    ).toEqual(['Studio', 'Screenshot']);
    expect(wrapper.get('[aria-label="Studio"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).not.toMatch(/Add|Rename|Delete|Save/);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Microphone"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="System audio"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('button[aria-label="Camera"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('true');

    wrapper.unmount();
  });

  it('keeps two equal mode buttons with a full French accessible Screenshot label', async () => {
    setCurrentLocale('fr');
    const wrapper = await mountBar();

    try {
      const group = wrapper.get('.capture-modes');
      const buttons = group.findAll('button');

      expect(group.classes()).toEqual(expect.arrayContaining(['full-width', 'column-layout']));
      expect(group.attributes('style')).toContain('--button-group-columns: 2');
      expect(buttons).toHaveLength(2);
      expect(buttons[1].attributes('aria-label')).toBe('Capture d’écran');
      expect(buttons[1].attributes('title')).toBe('Capture d’écran');
      expect(buttons[1].get('.btn-content-label').text()).toBe('Capture d’écran');
    } finally {
      wrapper.unmount();
      setCurrentLocale('en');
    }
  });

  it('opens the enabled preset select from its setting field without reopening a select click', async () => {
    const wrapper = await mountBar();
    const select = wrapper.get<HTMLSelectElement>('.preset-select').element;
    const focus = vi.spyOn(select, 'focus');

    await wrapper.get('.preset-field .field-label').trigger('click');
    expect(focus).toHaveBeenCalledOnce();
    expect(showPicker).toHaveBeenCalledOnce();
    expect(showPickerTargets[0]).toBe(select);

    await wrapper.get('.preset-select').trigger('click');
    expect(showPicker).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  it('does not open or focus a native select when its setting field is disabled', async () => {
    const wrapper = await mountBar();
    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();

    const select = wrapper.get<HTMLSelectElement>('.preset-select').element;
    const focus = vi.spyOn(select, 'focus');
    expect(select.disabled).toBe(true);
    await wrapper.get('.preset-field .field-label').trigger('click');

    expect(focus).not.toHaveBeenCalled();
    expect(showPicker).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('applies live recording-bar visibility after selection and tracks pointer hover', async () => {
    mocks.preferencesSettings!.recordingBar.visibility = 'auto-fade';
    const wrapper = await mountBar();
    const cropBar = wrapper.get('.crop-bar');

    expect(mocks.preferencesLoad).toHaveBeenCalledOnce();
    expect(cropBar.classes()).not.toContain('auto-fade');
    expect(cropBar.classes()).not.toContain('hover-only');
    expect(wrapper.find('.preset-field').exists()).toBe(true);

    await mocks.state?.({ state: 'selecting' });
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).not.toContain('auto-fade');
    expect(wrapper.find('.preset-field').exists()).toBe(true);

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    await mocks.state?.({ state: 'recording' });
    await wrapper.vm.$nextTick();
    expect(cropBar.classes()).toContain('auto-fade');
    await cropBar.trigger('pointerenter');
    expect(cropBar.classes()).toContain('pointer-over');
    await cropBar.trigger('pointerleave');
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
    await wrapper.get('button[aria-label="System audio"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(mocks.nativePreviewEnabled?.value).toBe(true);

    mocks.nativePreviewLevel!.value = 0.73;
    await wrapper.vm.$nextTick();
    expect(wrapper.get<HTMLElement>('button[aria-label="System audio"] .level-bar-fill').element.style.height).toBe(
      '73%',
    );

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
    expect(wrapper.get<HTMLElement>('button[aria-label="System audio"] .level-bar-fill').element.style.height).toBe(
      '42%',
    );

    wrapper.unmount();
  });

  it('shows enabled audio meters and Lucide off glyphs without disabling any toggle', async () => {
    const wrapper = await mountBar();
    const microphone = wrapper.get('button[aria-label="Microphone"]');
    const systemAudio = wrapper.get('button[aria-label="System audio"]');
    const camera = wrapper.get('button[aria-label="Camera"]');
    const zoom = wrapper.get('button[aria-label="Automatic zoom"]');

    expect(microphone.find('.audio-icon-meter').exists()).toBe(true);
    expect(systemAudio.find('.audio-icon-meter').exists()).toBe(false);
    expect(systemAudio.find('.toggle-icon.is-off .lucide-volume-off').exists()).toBe(true);
    expect(camera.find('.lucide-camera').exists()).toBe(true);
    expect(zoom.find('.lucide-zoom-in').exists()).toBe(true);
    expect(zoom.find('.off-slash').exists()).toBe(false);

    for (const toggle of [microphone, systemAudio, camera, zoom]) {
      expect(toggle.attributes('disabled')).toBeUndefined();
    }

    await microphone.trigger('click');
    await systemAudio.trigger('click');
    await camera.trigger('click');
    await zoom.trigger('click');
    await wrapper.vm.$nextTick();

    expect(microphone.attributes('aria-pressed')).toBe('false');
    expect(microphone.attributes('disabled')).toBeUndefined();
    expect(microphone.find('.audio-icon-meter').exists()).toBe(false);
    expect(microphone.find('.toggle-icon.is-off .lucide-mic-off').exists()).toBe(true);

    expect(systemAudio.attributes('aria-pressed')).toBe('true');
    expect(systemAudio.attributes('disabled')).toBeUndefined();
    expect(systemAudio.find('.audio-icon-meter').exists()).toBe(true);
    expect(systemAudio.find('.toggle-icon.is-off').exists()).toBe(false);

    expect(camera.attributes('aria-pressed')).toBe('false');
    expect(camera.attributes('disabled')).toBeUndefined();
    expect(camera.find('.toggle-icon.is-off .lucide-camera-off').exists()).toBe(true);

    expect(zoom.attributes('aria-pressed')).toBe('false');
    expect(zoom.attributes('disabled')).toBeUndefined();
    expect(zoom.find('.toggle-icon.is-off .lucide-zoom-in').exists()).toBe(true);
    expect(zoom.find('.toggle-icon.is-off .off-slash.lucide-slash').exists()).toBe(true);

    wrapper.unmount();
  });

  it('renders compact settings with translated labels, icons, titles, and a localized default preset', async () => {
    setCurrentLocale('en');
    const english = await mountBar();

    expect(english.get('.crop-bar').attributes('aria-label')).toBe('Quick Snip controls');
    expect(english.get('.drag-handle').attributes('title')).toBe('Move Quick Snip');
    expect(english.get('.capture-modes').attributes('aria-label')).toBe('Mode');
    expect(
      english
        .get('.capture-modes')
        .findAll('button')
        .map((button) => button.attributes('title')),
    ).toEqual(['Studio', 'Screenshot']);
    expect(english.get('.capture-modes').findAll('button svg')).toHaveLength(2);
    expect(english.get('.preset-field .field-label').text()).toBe('Preset');
    expect(english.find('.preset-field svg').exists()).toBe(true);
    expect(english.get('.preset-field').attributes('title')).toBe('Editor preset');
    expect(english.get('.preset-select').attributes('aria-label')).toBe('Editor preset');
    expect(english.get('.preset-select').attributes('title')).toBe('Editor preset');
    expect(english.get('.preset-select option[value="default"]').text()).toBe('Default');
    expect(english.find('.format-field').exists()).toBe(false);
    expect(english.findAll('select')).toHaveLength(1);
    expect(english.find('.control-group[aria-label="Recording sources"]').exists()).toBe(true);
    expect(english.find('.control-group[aria-label="Studio effects"]').exists()).toBe(true);
    expect(english.get('button[aria-label="Microphone"]').attributes('title')).toBe(
      'Microphone — right-click to choose a source',
    );
    expect(english.get('button[aria-label="System audio"]').attributes('title')).toBe(
      'System audio — right-click to choose a source',
    );
    expect(english.get('button[aria-label="Camera"]').attributes('title')).toBe(
      'Camera — right-click to choose a source',
    );
    expect(english.get('button[aria-label="Automatic zoom"]').attributes('title')).toBe('Automatic zoom');
    const captureButton = english.get('.capture-actions button');
    expect(captureButton.attributes('title')).toBe('Start: Alt+Shift+S');

    mocks.preferencesSettings!.shortcuts['quickSnip.toggle'] = { keys: 'Ctrl+Alt+Q' };
    await english.vm.$nextTick();
    expect(captureButton.attributes('title')).toBe('Start: Ctrl+Alt+Q');
    mocks.recorder!.phase.value = 'recording';
    await english.vm.$nextTick();
    expect(captureButton.attributes('title')).toBe('Stop: Ctrl+Alt+Q');

    mocks.preferencesSettings!.shortcuts['quickSnip.toggle'] = { keys: '' };
    await english.vm.$nextTick();
    expect(captureButton.attributes('title')).toBe('Stop');
    mocks.recorder!.phase.value = 'idle';
    await english.vm.$nextTick();
    expect(captureButton.attributes('title')).toBe('Start');
    expect(english.get('button[aria-label="Cancel"]').attributes('title')).toBe('Cancel');
    english.unmount();

    mocks.preferencesSettings!.shortcuts = {};
    setCurrentLocale('fr');
    const french = await mountBar();

    expect(french.get('.crop-bar').attributes('aria-label')).toBe('Commandes Quick Snip');
    expect(french.get('.drag-handle').attributes('title')).toBe('Déplacer Quick Snip');
    expect(french.get('.capture-modes').attributes('aria-label')).toBe('Mode');
    expect(
      french
        .get('.capture-modes')
        .findAll('button')
        .map((button) => button.attributes('title')),
    ).toEqual(['Studio', 'Capture d’écran']);
    expect(french.get('.preset-field .field-label').text()).toBe('Préréglage');
    expect(french.get('.preset-field').attributes('title')).toBe('Préréglage de l’éditeur');
    expect(french.get('.preset-select').attributes('title')).toBe('Préréglage de l’éditeur');
    expect(french.get('.preset-select option[value="default"]').text()).toBe('Par défaut');
    expect(french.find('.format-field').exists()).toBe(false);
    expect(french.findAll('select')).toHaveLength(1);
    expect(french.find('.control-group[aria-label="Sources de l’enregistrement"]').exists()).toBe(true);
    expect(french.find('.control-group[aria-label="Effets Studio"]').exists()).toBe(true);
    expect(french.get('button[aria-label="Microphone"]').attributes('title')).toBe(
      'Microphone — clic droit pour choisir une source',
    );
    expect(french.get('button[aria-label="Audio système"]').attributes('title')).toBe(
      'Audio système — clic droit pour choisir une source',
    );
    expect(french.get('button[aria-label="Caméra"]').attributes('title')).toBe(
      'Caméra — clic droit pour choisir une source',
    );
    expect(french.get('button[aria-label="Zoom automatique"]').attributes('title')).toBe('Zoom automatique');
    expect(french.get('.capture-actions button').attributes('title')).toBe('Démarrer : Alt+Shift+S');
    expect(french.get('.capture-actions button').text()).toContain('Démarrer');
    expect(french.get('button[aria-label="Annuler"]').attributes('title')).toBe('Annuler');

    mocks.recorder!.phase.value = 'recording';
    await french.vm.$nextTick();
    expect(french.get('.capture-actions button').attributes('title')).toBe('Arrêter : Alt+Shift+S');
    expect(french.get('.capture-actions button').text()).toContain('Arrêter');
    french.unmount();
    setCurrentLocale('en');
  });

  it('keeps settings and controls in two rows with separated audio, effect, and action groups', async () => {
    const wrapper = await mountBar();

    expect(wrapper.get('.settings-row').attributes('role')).toBe('group');
    expect(wrapper.get('.settings-row').attributes('aria-label')).toBe('Recording settings');
    expect(wrapper.find('.controls-row').exists()).toBe(true);
    expect(wrapper.findAll('.crop-controls > .divider')).toHaveLength(1);
    expect(wrapper.findAll('[role="separator"][aria-orientation="vertical"]')).toHaveLength(3);

    const row = wrapper.get('.controls-row').element;
    const children = Array.from(row.children);
    const orderedGroups = [
      row.querySelector('.control-group[aria-label="Recording sources"]'),
      row.querySelector('.control-divider'),
      row.querySelector('.control-group[aria-label="Studio effects"]'),
      row.querySelectorAll('.control-divider')[1],
      row.querySelector('.capture-actions'),
    ];
    expect(orderedGroups.map((element) => children.indexOf(element!))).toEqual([0, 1, 2, 3, 4]);
    expect(
      wrapper
        .get('.control-group[aria-label="Recording sources"]')
        .findAll('button')
        .map((button) => button.attributes('aria-label')),
    ).toEqual(['Microphone', 'System audio']);
    expect(
      wrapper
        .get('.control-group[aria-label="Studio effects"]')
        .findAll('button')
        .map((button) => button.attributes('aria-label')),
    ).toEqual(['Camera', 'Automatic zoom']);

    wrapper.unmount();
  });

  it('preserves the crop bar and mode group while only switching controls between Screenshot and video', async () => {
    const wrapper = await mountBar();
    const section = wrapper.get('.crop-bar').element;
    const modeGroup = wrapper.get('.capture-modes').element;
    const videoRow = wrapper.get('.controls-row').element;

    await mocks.configure?.({ ...configuration, mode: 'instant' });
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(wrapper.get('.crop-bar').element).toBe(section);
    expect(wrapper.get('.capture-modes').element).toBe(modeGroup);
    expect(wrapper.get('.controls-row').element).toBe(videoRow);

    await wrapper.get('[aria-label="Screenshot"]').trigger('click');
    await flushPromises();
    const screenshotRow = wrapper.get('.controls-row').element;

    expect(wrapper.get('.crop-bar').element).toBe(section);
    expect(wrapper.get('.capture-modes').element).toBe(modeGroup);
    expect(screenshotRow).not.toBe(videoRow);
    expect(wrapper.find('[aria-label="Microphone"]').exists()).toBe(false);

    await wrapper.get('[aria-label="Studio"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('.crop-bar').element).toBe(section);
    expect(wrapper.get('.capture-modes').element).toBe(modeGroup);
    expect(wrapper.get('.controls-row').element).not.toBe(screenshotRow);
    expect(wrapper.find('[aria-label="Microphone"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('keeps the screenshot preset and hides all audio, camera, and zoom controls', async () => {
    const screenshotConfiguration = {
      ...configuration,
      mode: 'screenshot' as const,
      screenshotAction: 'copy' as const,
    } satisfies QuickSnipConfiguration;
    const wrapper = await mountBar(screenshotConfiguration);

    expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.preset-field').exists()).toBe(true);
    expect(wrapper.findAll('select')).toHaveLength(1);
    expect(wrapper.find('[aria-label="Microphone"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="System audio"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Camera"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Automatic zoom"]').exists()).toBe(false);
    expect(wrapper.findAll('.control-group')).toHaveLength(0);
    expect(mocks.capture.getEditorPresets).toHaveBeenCalledWith('screenshot');

    wrapper.unmount();
  });

  it('selects screenshot presets from their own preset collection in the shared preset field', async () => {
    const screenshotPreset = { ...preset, id: 'screenshot-preset', name: 'Screenshot preset' };
    const screenshotPresets = {
      schemaVersion: 1 as const,
      activePresetId: screenshotPreset.id,
      presets: [preset, screenshotPreset],
    };
    mocks.capture.getEditorPresets.mockResolvedValue(screenshotPresets);
    mocks.capture.selectEditorPreset.mockResolvedValue(screenshotPresets);
    const screenshotConfiguration = {
      ...configuration,
      mode: 'screenshot' as const,
      screenshotAction: 'copy' as const,
    } satisfies QuickSnipConfiguration;
    const wrapper = await mountBar(screenshotConfiguration);
    mocks.capture.selectEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();

    await wrapper.get('.preset-select').setValue(screenshotPreset.id);
    await flushPromises();

    expect(mocks.capture.selectEditorPreset).toHaveBeenCalledWith(screenshotPreset.id, 'screenshot');
    expect(wrapper.get('.preset-select option:checked').text()).toBe('Screenshot preset');
    expect(mocks.capture.configureQuickSnip).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'screenshot', automaticZoom: false }),
    );
    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('offers one Screenshot action that captures and copies without opening the editor', async () => {
    const wrapper = await mountBar();
    await wrapper.get('[aria-label="Screenshot"]').trigger('click');
    await flushPromises();

    mocks.capture.quickSnipStart.mockClear();
    await wrapper
      .findAll('.capture-actions button')
      .find((button) => button.text() === 'Screenshot')!
      .trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'screenshot', screenshotAction: 'copy', automaticZoom: false }),
    );

    expect(wrapper.findAll('.capture-actions button').map((button) => button.text())).toEqual(['Screenshot', '']);
    expect(wrapper.find('.controls-row .control-divider').exists()).toBe(false);
    expect(wrapper.get('.capture-actions button').attributes('title')).toContain('Screenshot');

    wrapper.unmount();
  });

  it('restores video preset devices and zoom after leaving Screenshot without persisting screenshot settings', async () => {
    const wrapper = await mountBar({ ...configuration, mode: 'screenshot', devices: {}, automaticZoom: false });
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockImplementationOnce(async () => {
      mocks.configure?.(configuration);
      return { state: 'selecting' };
    });

    await wrapper.get('[aria-label="Studio"]').trigger('click');
    await flushPromises();

    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('true');
    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledWith(preset.settings);
    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({ cameraId: 'camera-1', microphoneId: 'mic-1', systemAudio: false }),
    );
    wrapper.unmount();
  });

  it.each(['studio', 'screenshot', 'instant'] as const)('shows the preset icon for %s capture', async (mode) => {
    const wrapper = await mountBar({ ...configuration, mode });
    expect(
      wrapper
        .get('.preset-field')
        .find(mode === 'screenshot' ? '.lucide-scan-line' : '.lucide-clapperboard')
        .exists(),
    ).toBe(true);
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
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'capture-cancelled', name: configuration.name });
    expect(mocks.capture.saveScreenshot).not.toHaveBeenCalled();
    expect(mocks.capture.exportScreenshot).not.toHaveBeenCalled();
    expect(wrapper.get('.capture-actions button').attributes('disabled')).toBeUndefined();
    expect(wrapper.get('[aria-label="Screenshot"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get<HTMLSelectElement>('.preset-select').element.value).toBe('default');
    await wrapper.get('.capture-actions button').trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(expect.objectContaining({ mode: 'screenshot' }));
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
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'capture-cancelled', name: configuration.name });
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
    expect(mocks.capture.exportScreenshot).toHaveBeenCalledWith(screenshotDocument.id, screenshotBytes, 'png', true);
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
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start');
    expect(startButton).toBeDefined();

    mocks.capture.configureQuickSnip.mockClear();
    mocks.capture.quickSnipToggle.mockClear();
    mocks.capture.quickSnipStart.mockClear();
    await startButton!.trigger('click');
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'studio', automaticZoom: true, screenshotAction: 'copy' }),
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
    const stopButton = wrapper.findAll('button').find((button) => button.text() === 'Stop');
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
    expect(structuredClone(startConfiguration)).toEqual(expect.objectContaining({ region: configuration.region }));

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
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start')!
      .trigger('click');
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
          devices: { micId: 'preset-mic', cameraId: 'preset-camera', systemAudioMode: 'off' as const },
        },
      },
      devices: { micId: 'job-mic', cameraId: 'job-camera', systemAudioMode: 'on' as const },
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
          devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'off' as const },
        },
      },
      devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'off' as const },
    } satisfies QuickSnipConfiguration;
    await mocks.configure?.(disabledConfiguration);
    await flushPromises();

    await wrapper.get('[aria-label="Microphone"]').trigger('click');
    await wrapper.get('[aria-label="Camera"]').trigger('click');
    await flushPromises();
    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({ cameraId: 'default', microphoneId: 'default' }),
    );

    wrapper.unmount();
  });

  it('falls back to Default when incoming preset metadata is empty', async () => {
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    await mocks.configure?.({
      ...configuration,
      preset: { ...preset, id: '', name: '' },
      devices: {},
    });
    await flushPromises();

    expect(wrapper.get('.preset-select').text()).toContain('Default');

    wrapper.unmount();
  });

  it('synchronizes zoom and every device toggle from the controls', async () => {
    const wrapper = await mountBar();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();

    await wrapper.get('button[aria-label="Automatic zoom"]').trigger('click');
    await wrapper.get('[aria-label="Microphone"]').trigger('click');
    await wrapper.get('[aria-label="System audio"]').trigger('click');
    await wrapper.get('[aria-label="Camera"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('button[aria-label="Microphone"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('button[aria-label="System audio"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Camera"]').attributes('aria-pressed')).toBe('false');

    expect(mocks.capture.configureQuickSnip).toHaveBeenLastCalledWith({
      mode: 'studio',
      automaticZoom: false,
      devices: {
        micId: 'no-audio',
        cameraId: 'off',
        systemAudioMode: 'on',
      },
    });
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'on' },
        quickSnip: { automaticZoom: false },
      }),
    );

    wrapper.unmount();
  });

  it('serializes setting writes so only one preset update is active at a time', async () => {
    const wrapper = await mountBar();
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const releaseWrites: Array<() => void> = [];
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();
    mocks.capture.updateActiveEditorPreset.mockImplementation(
      () =>
        new Promise((resolve) => {
          activeWrites += 1;
          maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
          releaseWrites.push(() => {
            activeWrites -= 1;
            resolve(presetDocument);
          });
        }),
    );

    const microphoneChange = wrapper.get('[aria-label="Microphone"]').trigger('click');
    const systemAudioChange = wrapper.get('[aria-label="System audio"]').trigger('click');
    await flushPromises();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledOnce();
    expect(maxActiveWrites).toBe(1);
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledTimes(2);

    releaseWrites.shift()!();
    await flushPromises();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledTimes(2);
    expect(maxActiveWrites).toBe(1);

    releaseWrites.shift()!();
    await Promise.all([microphoneChange, systemAudioChange]);
    await flushPromises();
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledTimes(2);
    expect(maxActiveWrites).toBe(1);

    wrapper.unmount();
  });

  it('reports a current synchronization failure from a control change', async () => {
    const wrapper = await mountBar();
    const failure = new Error('shortcut configuration failed');
    mocks.capture.configureQuickSnip.mockRejectedValueOnce(failure);
    mocks.capture.reportQuickSnip.mockClear();

    await wrapper.get('button[aria-label="Automatic zoom"]').trigger('click');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });

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

    const zoomChange = wrapper.get('button[aria-label="Automatic zoom"]').trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    rejectConfigure(new Error('stale shortcut configuration failed'));
    await Promise.all([zoomChange, flushPromises()]);

    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('applies a selected video preset and synchronizes all of its device settings', async () => {
    const selectedPreset = {
      ...preset,
      id: 'studio-preset',
      name: 'Studio preset',
      settings: {
        ...preset.settings,
        devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'on' as const },
        quickSnip: { automaticZoom: false },
      },
    };
    const document = {
      schemaVersion: 1 as const,
      activePresetId: selectedPreset.id,
      presets: [preset, selectedPreset],
    };
    mocks.capture.getEditorPresets.mockResolvedValue(document);
    mocks.capture.selectEditorPreset.mockResolvedValue(document);
    const wrapper = await mountBar();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();

    await wrapper.get('.preset-select').setValue(selectedPreset.id);
    await flushPromises();

    expect(mocks.capture.selectEditorPreset).toHaveBeenCalledWith(selectedPreset.id, 'video');
    expect(wrapper.get(`.preset-select option[value="${selectedPreset.id}"]`).text()).toBe('Studio preset');
    expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('false');
    expect(mocks.capture.configureQuickSnip).toHaveBeenLastCalledWith({
      mode: 'studio',
      automaticZoom: false,
      devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'on' },
    });
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenLastCalledWith(
      expect.objectContaining({
        devices: { micId: 'no-audio', cameraId: 'off', systemAudioMode: 'on' },
        quickSnip: { automaticZoom: false },
      }),
    );

    wrapper.unmount();
  });

  it('leaves controls unchanged when preset selection returns no active preset', async () => {
    const alternatePreset = { ...preset, id: 'alternate', name: 'Alternate' };
    mocks.capture.getEditorPresets.mockResolvedValue({
      ...presetDocument,
      presets: [preset, alternatePreset],
    });
    mocks.capture.selectEditorPreset.mockResolvedValue({
      schemaVersion: 1,
      activePresetId: 'missing',
      presets: [preset],
    });
    const wrapper = await mountBar();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();
    await wrapper.get('.preset-select').setValue(alternatePreset.id);
    await flushPromises();

    expect(mocks.capture.selectEditorPreset).toHaveBeenCalledWith(alternatePreset.id, 'video');
    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(mocks.capture.configureQuickSnip).not.toHaveBeenCalled();
    expect(wrapper.get('.preset-select').element).toHaveProperty('value', alternatePreset.id);

    wrapper.unmount();
  });

  it('reports preset selection failures and releases the pending controls', async () => {
    const alternatePreset = { ...preset, id: 'alternate', name: 'Alternate' };
    mocks.capture.getEditorPresets.mockResolvedValue({
      ...presetDocument,
      presets: [preset, alternatePreset],
    });
    const wrapper = await mountBar();
    const failure = new Error('preset selection failed');
    mocks.capture.selectEditorPreset.mockRejectedValueOnce(failure);
    mocks.capture.reportQuickSnip.mockClear();

    await wrapper.get('.preset-select').setValue(alternatePreset.id);
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });
    expect(wrapper.get('.preset-select').attributes('disabled')).toBeUndefined();

    wrapper.unmount();
  });

  it('ignores an older asynchronous preset list after a newer configuration arrives', async () => {
    let resolveFirst!: (document: typeof presetDocument) => void;
    let resolveSecond!: (document: typeof presetDocument) => void;
    const firstList = new Promise<typeof presetDocument>((resolve) => {
      resolveFirst = resolve;
    });
    const secondList = new Promise<typeof presetDocument>((resolve) => {
      resolveSecond = resolve;
    });
    mocks.capture.getEditorPresets.mockReturnValueOnce(firstList).mockReturnValueOnce(secondList);
    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    const firstConfiguration = { ...configuration, name: 'First Quick Snip' };
    const secondConfiguration = { ...configuration, name: 'Second Quick Snip' };
    mocks.configure?.(firstConfiguration);
    mocks.configure?.(secondConfiguration);
    await wrapper.vm.$nextTick();

    const stalePreset = { ...preset, id: 'stale', name: 'Stale preset' };
    resolveFirst({ schemaVersion: 1, activePresetId: stalePreset.id, presets: [stalePreset] });
    await flushPromises();
    expect(wrapper.get('.preset-select').text()).not.toContain(stalePreset.name);

    const latestPreset = { ...preset, id: 'latest', name: 'Latest preset' };
    resolveSecond({ schemaVersion: 1, activePresetId: latestPreset.id, presets: [latestPreset] });
    await flushPromises();
    expect(wrapper.get('.preset-select').text()).toContain(latestPreset.name);

    wrapper.unmount();
  });

  it('ignores a stale preset-list failure after a newer configuration arrives', async () => {
    const wrapper = await mountBar();
    let rejectStale!: (reason: unknown) => void;
    let resolveLatest!: (document: typeof presetDocument) => void;
    const staleList = new Promise<typeof presetDocument>((_resolve, reject) => {
      rejectStale = reject;
    });
    const latestList = new Promise<typeof presetDocument>((resolve) => {
      resolveLatest = resolve;
    });
    mocks.capture.getEditorPresets.mockReturnValueOnce(staleList).mockReturnValueOnce(latestList);
    mocks.capture.reportQuickSnip.mockClear();
    mocks.configure?.({ ...configuration, name: 'Stale configuration' });
    mocks.configure?.({ ...configuration, name: 'Latest configuration' });
    rejectStale(new Error('stale preset list failed'));
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    resolveLatest(presetDocument);
    await flushPromises();
    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('reports an error when the current preset list cannot be loaded', async () => {
    const failure = new Error('preset list unavailable');
    mocks.capture.getEditorPresets.mockRejectedValueOnce(failure);
    const wrapper = await mountBar();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });

    wrapper.unmount();
  });

  it('starts even when the active preset is absent from the preset document', async () => {
    const document = { schemaVersion: 1 as const, activePresetId: 'missing', presets: [preset] };
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
        devices: { micId: 'incoming-mic', cameraId: 'incoming-camera', systemAudioMode: 'on' as const },
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

    expect(wrapper.get('[aria-label="Studio"]').attributes('aria-pressed')).toBe('true');
    expect(mocks.capture.getEditorPresets).toHaveBeenCalledOnce();
    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(mocks.capture.configureQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('starts from a command without waiting for the asynchronous preset list', async () => {
    let resolvePresetList!: (document: typeof presetDocument) => void;
    const delayedPresetList = new Promise<typeof presetDocument>((resolve) => {
      resolvePresetList = resolve;
    });
    mocks.capture.getEditorPresets.mockReturnValueOnce(delayedPresetList).mockResolvedValue(presetDocument);

    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    void mocks.configure?.(configuration);
    await wrapper.vm.$nextTick();
    expect(mocks.capture.getEditorPresets).toHaveBeenCalledOnce();

    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.recorder?.start).toHaveBeenCalledOnce();

    resolvePresetList(presetDocument);
    await flushPromises();
    wrapper.unmount();
  });

  it('reports a failed Quick Snip when settings persistence rejects before recorder startup', async () => {
    const wrapper = await mountBar();
    const failure = new Error('preset persistence failed');
    mocks.capture.updateActiveEditorPreset.mockRejectedValueOnce(failure);

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.recorder?.start).not.toHaveBeenCalled();
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });

    wrapper.unmount();
  });

  it('reports explicit Start failures and restores the Start control', async () => {
    const wrapper = await mountBar();
    const failure = 'native Quick Snip start failed';
    mocks.capture.quickSnipStart.mockRejectedValueOnce(failure);
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start')!;

    await startButton.trigger('click');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure });
    expect(startButton.attributes('disabled')).toBeUndefined();

    wrapper.unmount();
  });

  it('reports recorder startup failures from shortcut commands', async () => {
    const wrapper = await mountBar();
    const failure = new Error('native recorder start failed');
    mocks.recorder!.start.mockRejectedValueOnce(failure);

    await mocks.command?.('start');
    await flushPromises();

    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });

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

    const modeChange = wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start')!;
    const pendingStart = startButton.trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    resolveConfigure({ state: 'selecting' });
    await Promise.all([modeChange, pendingStart, flushPromises()]);

    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('ignores a stale preset selection result after a cancel command', async () => {
    const alternatePreset = { ...preset, id: 'alternate', name: 'Alternate' };
    mocks.capture.getEditorPresets.mockResolvedValue({
      ...presetDocument,
      presets: [preset, alternatePreset],
    });
    const wrapper = await mountBar();
    let resolveSelection!: (document: typeof presetDocument) => void;
    const pendingSelection = new Promise<typeof presetDocument>((resolve) => {
      resolveSelection = resolve;
    });
    mocks.capture.selectEditorPreset.mockReturnValueOnce(pendingSelection);
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();

    const selection = wrapper.get('.preset-select').setValue(alternatePreset.id);
    await flushPromises();
    await mocks.command?.('cancel');
    resolveSelection({ ...presetDocument, activePresetId: alternatePreset.id, presets: [alternatePreset] });
    await Promise.all([selection, flushPromises()]);

    expect(mocks.capture.updateActiveEditorPreset).not.toHaveBeenCalled();
    expect(mocks.capture.configureQuickSnip).not.toHaveBeenCalled();

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
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'completed', session });

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
    expect(mocks.capture.reportQuickSnip).toHaveBeenCalledWith({ type: 'failed', error: failure.message });

    wrapper.unmount();
  });

  it('disables Start and settings while startup is pending, preparing, or recording', async () => {
    const wrapper = await mountBar();
    let resolveStart!: (snapshot: { state: 'preparing' }) => void;
    mocks.capture.quickSnipStart.mockReturnValue(
      new Promise<{ state: 'preparing' }>((resolve) => {
        resolveStart = resolve;
      }),
    );
    const expectSettingsDisabled = () => {
      for (const mode of ['Studio', 'Screenshot']) {
        expect(wrapper.get(`[aria-label="${mode}"]`).attributes('disabled')).toBeDefined();
      }
      expect(wrapper.find('.preset-select').attributes('disabled')).toBeDefined();
      expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('disabled')).toBeDefined();
      for (const label of ['Microphone', 'System audio', 'Camera']) {
        expect(wrapper.get(`[aria-label="${label}"]`).attributes('disabled')).toBeDefined();
      }
    };

    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start')!;
    const pendingClick = startButton.trigger('click');
    const duplicateClick = startButton.trigger('click');
    await wrapper.vm.$nextTick();
    expect(startButton.attributes('disabled')).toBeDefined();
    expectSettingsDisabled();
    await duplicateClick;
    expect(mocks.capture.quickSnipStart).toHaveBeenCalledOnce();

    resolveStart({ state: 'preparing' });
    await pendingClick;
    await flushPromises();

    mocks.recorder!.phase.value = 'starting';
    await wrapper.vm.$nextTick();
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Start')!
        .attributes('disabled'),
    ).toBeDefined();
    expectSettingsDisabled();

    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();
    expectSettingsDisabled();
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Stop')!
        .attributes('disabled'),
    ).toBeUndefined();

    wrapper.unmount();
  });

  it('shows Default while the preset document is delayed or empty', async () => {
    const emptyDocument = { schemaVersion: 1 as const, activePresetId: null, presets: [] };
    let resolveDocument!: (document: typeof emptyDocument) => void;
    mocks.capture.getEditorPresets.mockReturnValue(
      new Promise((resolve) => {
        resolveDocument = resolve;
      }),
    );

    const wrapper = mount(QuickSnipCropBar, {
      attachTo: document.body,
      global: { stubs: { Button: ButtonStub } },
    });
    void mocks.configure?.(configuration);
    await wrapper.vm.$nextTick();

    const presetSelect = wrapper.get('.preset-select');
    expect(presetSelect.text()).toContain('Default');
    expect(presetSelect.text()).not.toContain('Select an option');

    resolveDocument(emptyDocument);
    await flushPromises();
    expect(presetSelect.text()).toContain('Default');
    expect(presetSelect.text()).not.toContain('Select an option');
    wrapper.unmount();
  });

  it('uses native title attributes and never mounts a custom tooltip for Crop Bar actions', async () => {
    const wrapper = await mountBar();
    const titles = wrapper
      .findAll('button')
      .map((button) => button.attributes('title'))
      .filter(Boolean);

    expect(titles).toEqual(
      expect.arrayContaining([
        'Microphone — right-click to choose a source',
        'System audio — right-click to choose a source',
        'Camera — right-click to choose a source',
        'Cancel',
      ]),
    );
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
    mocks.recorder!.recordingTime.value = '01:02.3';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:02');

    mocks.recorder!.recordingTime.value = '60:00.0';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:00:00');
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
    const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    cameraButton.element.dispatchEvent(context);
    await flushPromises();
    expect(context.defaultPrevented).toBe(true);
    expect(mocks.capture.chooseQuickSnipDevice).toHaveBeenCalledWith(expect.objectContaining({ kind: 'camera' }));
    expect(cameraButton.attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.crop-bar').classes()).toContain('pointer-over');
    expect(wrapper.get('.preset-select').attributes('disabled')).toBeDefined();
    resolveMenu('camera:chromium:usb');
    await flushPromises();
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledWith(
      expect.objectContaining({ devices: expect.objectContaining({ cameraId: 'camera:chromium:usb' }) }),
    );
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledWith(
      expect.objectContaining({ devices: expect.objectContaining({ cameraId: 'camera:chromium:usb' }) }),
    );
    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.recorder!.start).toHaveBeenCalledWith(expect.objectContaining({ cameraId: 'camera:chromium:usb' }));
    wrapper.unmount();
  });
});
