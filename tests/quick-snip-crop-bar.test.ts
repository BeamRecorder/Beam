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
    configureQuickSnip: vi.fn(),
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
  configure: null as ((configuration: QuickSnipConfiguration) => unknown) | null,
  command: null as ((command: 'start' | 'stop' | 'cancel') => unknown) | null,
  state: null as ((snapshot: { state: string }) => unknown) | null,
  offConfigure: null as ReturnType<typeof vi.fn> | null,
  offCommand: null as ReturnType<typeof vi.fn> | null,
  offState: null as ReturnType<typeof vi.fn> | null,
}));

vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
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
    ) => {
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
    export: { format: 'mp4' as const },
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
  rawOutputRoot: '/videos/Beam/user/quick-snip/.work',
  devices: preset.settings.devices,
} satisfies QuickSnipConfiguration;

const windowConfiguration = {
  ...configuration,
  screenKind: 'window' as const,
  screenId: 'portal:window',
  region: null,
} satisfies QuickSnipConfiguration;

const ButtonStub = {
  inheritAttrs: true,
  props: ['disabled', 'icon', 'loading', 'iconOnly'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled || loading" @click="$emit(\'click\')"><component v-if="icon && !$slots.icon && !loading" :is="icon" /><slot v-if="!loading" name="icon" /><slot /></button>',
};
const mountBar = async () => {
  const wrapper = mount(QuickSnipCropBar, {
    attachTo: document.body,
    global: { stubs: { Button: ButtonStub } },
  });
  await mocks.configure?.(configuration);
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.capture.configureQuickSnip.mockResolvedValue({ state: 'selecting' });
  mocks.capture.reportQuickSnip.mockResolvedValue({ state: 'recording' });
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

    expect(wrapper.findAll('select')).toHaveLength(3);
    expect(wrapper.text()).not.toMatch(/Add|Rename|Delete|Save/);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Microphone"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="System audio"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.get('button[aria-label="Camera"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('true');

    wrapper.unmount();
  });

  it('opens each enabled native select from its setting field without reopening a select click', async () => {
    const wrapper = await mountBar();
    const fields = [
      ['.mode-field .field-label', '.mode-select'],
      ['.preset-field .field-label', '.preset-select'],
      ['.format-field .field-label', '.format-select'],
    ] as const;
    const focusSpies = fields.map(([, selectSelector]) =>
      vi.spyOn(wrapper.get<HTMLSelectElement>(selectSelector).element, 'focus'),
    );

    for (let index = 0; index < fields.length; index += 1) {
      await wrapper.get(fields[index]![0]).trigger('click');
      expect(focusSpies[index]).toHaveBeenCalledOnce();
      expect(showPicker).toHaveBeenCalledTimes(index + 1);
      expect(showPickerTargets[index]).toBe(wrapper.get<HTMLSelectElement>(fields[index]![1]).element);
    }

    for (const [, selectSelector] of fields) {
      await wrapper.get(selectSelector).trigger('click');
    }
    expect(showPicker).toHaveBeenCalledTimes(fields.length);

    wrapper.unmount();
  });

  it('does not open or focus a native select when its setting field is disabled', async () => {
    const wrapper = await mountBar();
    mocks.recorder!.phase.value = 'recording';
    await wrapper.vm.$nextTick();

    const select = wrapper.get<HTMLSelectElement>('.format-select').element;
    const focus = vi.spyOn(select, 'focus');
    expect(select.disabled).toBe(true);
    await wrapper.get('.format-field .field-label').trigger('click');

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
    expect(english.get('.mode-field .field-label').text()).toBe('Mode');
    expect(english.find('.mode-field svg').exists()).toBe(true);
    expect(english.get('.mode-field').attributes('title')).toBe('Apply your preset and visual effects');
    expect(english.get('.mode-select').attributes('title')).toBe('Apply your preset and visual effects');
    expect(english.get('.preset-field .field-label').text()).toBe('Preset');
    expect(english.find('.preset-field svg').exists()).toBe(true);
    expect(english.get('.preset-field').attributes('title')).toBe('Editor preset');
    expect(english.get('.preset-select').attributes('aria-label')).toBe('Editor preset');
    expect(english.get('.preset-select').attributes('title')).toBe('Editor preset');
    expect(english.get('.preset-select option[value="default"]').text()).toBe('Default');
    expect(english.get('.format-field .field-label').text()).toBe('Format');
    expect(english.find('.format-field svg').exists()).toBe(true);
    expect(english.get('.format-select').attributes('title')).toBe('Export video format');
    expect(english.get('.format-select').attributes('aria-label')).toBe('Export video format');
    expect(english.find('.control-group[aria-label="Recording sources"]').exists()).toBe(true);
    expect(english.find('.control-group[aria-label="Studio effects"]').exists()).toBe(true);
    expect(english.get('button[aria-label="Microphone"]').attributes('title')).toBe('Microphone');
    expect(english.get('button[aria-label="System audio"]').attributes('title')).toBe('System audio');
    expect(english.get('button[aria-label="Camera"]').attributes('title')).toBe('Camera');
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
    expect(french.get('.mode-field .field-label').text()).toBe('Mode');
    expect(french.get('.mode-field').attributes('title')).toBe('Appliquer le préréglage et les effets visuels');
    expect(french.get('.preset-field .field-label').text()).toBe('Préréglage');
    expect(french.get('.preset-field').attributes('title')).toBe('Préréglage de l’éditeur');
    expect(french.get('.preset-select').attributes('title')).toBe('Préréglage de l’éditeur');
    expect(french.get('.preset-select option[value="default"]').text()).toBe('Par défaut');
    expect(french.get('.format-field .field-label').text()).toBe('Format');
    expect(french.get('.format-select').attributes('title')).toBe('Format de la vidéo exportée');
    expect(french.get('.format-select').attributes('aria-label')).toBe('Format de la vidéo exportée');
    expect(french.find('.control-group[aria-label="Sources de l’enregistrement"]').exists()).toBe(true);
    expect(french.find('.control-group[aria-label="Effets Studio"]').exists()).toBe(true);
    expect(french.get('button[aria-label="Microphone"]').attributes('title')).toBe('Microphone');
    expect(french.get('button[aria-label="Audio système"]').attributes('title')).toBe('Audio système');
    expect(french.get('button[aria-label="Caméra"]').attributes('title')).toBe('Caméra');
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
    expect(wrapper.findAll('[role="separator"][aria-orientation="vertical"]')).toHaveLength(4);

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

  it('keeps Raw free of camera, preset and zoom controls and starts with native-raw options', async () => {
    const wrapper = await mountBar();
    await wrapper.get('.mode-select').setValue('raw');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('select')).toHaveLength(2);
    expect(wrapper.find('.preset-field').exists()).toBe(false);
    expect(wrapper.get('.raw-description').text()).toBe('Without visual effects');
    expect(wrapper.find('[aria-label="Camera"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Automatic zoom"]').exists()).toBe(false);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.findAll('.control-group')).toHaveLength(1);
    expect(wrapper.findAll('[role="separator"][aria-orientation="vertical"]')).toHaveLength(3);

    await mocks.command?.('start');
    await flushPromises();
    expect(mocks.capture.quickSnipStart).not.toHaveBeenCalled();
    expect(mocks.recorder?.start).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraId: 'off',
        cursor: false,
        recordInteractions: false,
        region: configuration.region,
      }),
    );
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('camera');
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('preset');
    expect(mocks.recorder?.start.mock.calls[0][0]).not.toHaveProperty('zoom');

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
      expect.objectContaining({ mode: 'studio', format: 'mp4', automaticZoom: true }),
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

    await wrapper.get('.format-select').setValue('webm');
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

  it('synchronizes format, zoom, and every device toggle from the controls', async () => {
    const wrapper = await mountBar();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();

    await wrapper.get('.format-select').setValue('webm');
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
      format: 'webm',
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

    const formatChange = wrapper.get('.format-select').setValue('webm');
    const microphoneChange = wrapper.get('[aria-label="Microphone"]').trigger('click');
    await flushPromises();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledOnce();
    expect(maxActiveWrites).toBe(1);
    expect(mocks.capture.configureQuickSnip).toHaveBeenCalledTimes(2);

    releaseWrites.shift()!();
    await flushPromises();
    expect(mocks.capture.updateActiveEditorPreset).toHaveBeenCalledTimes(2);
    expect(maxActiveWrites).toBe(1);

    releaseWrites.shift()!();
    await Promise.all([formatChange, microphoneChange]);
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

    await wrapper.get('.format-select').setValue('webm');
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

    const formatChange = wrapper.get('.format-select').setValue('webm');
    await flushPromises();
    await mocks.command?.('cancel');
    rejectConfigure(new Error('stale shortcut configuration failed'));
    await Promise.all([formatChange, flushPromises()]);

    expect(mocks.capture.reportQuickSnip).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('applies a selected preset and synchronizes all of its device settings', async () => {
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

    expect(mocks.capture.selectEditorPreset).toHaveBeenCalledWith(selectedPreset.id);
    expect(wrapper.get(`.preset-select option[value="${selectedPreset.id}"]`).text()).toBe('Studio preset');
    expect(wrapper.get('button[aria-label="Automatic zoom"]').attributes('aria-pressed')).toBe('false');
    expect(mocks.capture.configureQuickSnip).toHaveBeenLastCalledWith({
      mode: 'studio',
      format: 'mp4',
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

    expect(mocks.capture.selectEditorPreset).toHaveBeenCalledWith(alternatePreset.id);
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
      format: 'webm' as const,
      automaticZoom: false,
      preset: incomingPreset,
      devices: incomingPreset.settings.devices,
    } satisfies QuickSnipConfiguration;

    mocks.capture.getEditorPresets.mockClear();
    mocks.capture.updateActiveEditorPreset.mockClear();
    mocks.capture.configureQuickSnip.mockClear();
    await mocks.configure?.(incoming);
    await flushPromises();

    expect(wrapper.get('.format-select').element).toHaveProperty('value', 'webm');
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

    const formatChange = wrapper.get('.format-select').setValue('webm');
    await flushPromises();
    await mocks.command?.('start');
    await flushPromises();
    await mocks.command?.('cancel');
    await flushPromises();

    resolvePresetRead(presetDocument);
    await Promise.all([formatChange, flushPromises()]);
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

    const formatChange = wrapper.get('.format-select').setValue('webm');
    await flushPromises();
    const startButton = wrapper.findAll('button').find((button) => button.text() === 'Start')!;
    const pendingStart = startButton.trigger('click');
    await flushPromises();
    await mocks.command?.('cancel');
    resolveConfigure({ state: 'selecting' });
    await Promise.all([formatChange, pendingStart, flushPromises()]);

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
      expect(wrapper.find('.mode-select').attributes('disabled')).toBeDefined();
      expect(wrapper.find('.preset-select').attributes('disabled')).toBeDefined();
      expect(wrapper.find('.format-select').attributes('disabled')).toBeDefined();
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
    mocks.recorder!.recordingTime.value = '01:02.3';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:02');

    mocks.recorder!.recordingTime.value = '60:00.0';
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.elapsed').text()).toBe('01:00:00');
    wrapper.unmount();
  });
});
