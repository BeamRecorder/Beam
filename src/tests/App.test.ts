import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';

const mocks = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    setInteractive: vi.fn(),
    setCameraOverlayActive: vi.fn(),
    hideScreenRegionOverlay: vi.fn(),
    setCountdown: vi.fn(async () => undefined),
    resetCameraOverlayPlacement: vi.fn(),
    setWindowMode: vi.fn(),
    setSize: vi.fn(),
    setWindowVisible: vi.fn(),
    showHud: vi.fn(),
    hideTeleprompter: vi.fn(),
    openEditor: vi.fn(),
    onStartRecordingFromEditor: vi.fn(),
    onEditorLoadingProgress: vi.fn(),
    onTrayStopRecording: vi.fn(),
    onPreferenceShortcut: vi.fn(),
    listProjects: vi.fn(),
    renameProject: vi.fn(),
    updateTrayMenu: vi.fn(),
  },
  controller: {
    recording: undefined as any,
    onComplete: undefined as ((session: { videoSrc?: string | null }) => void) | undefined,
    startFromEditor: undefined as ((configuration: any) => void) | undefined,
    editorProgress: undefined as ((progress: { stage: string; value: number }) => void) | undefined,
  },
}));

vi.mock('../api/capture', () => ({ capture: mocks.capture }));

vi.mock('../components/hud/recorder/useRecordingController', async () => {
  const { ref } = await import('vue');
  return {
    useRecordingController: (onComplete: (session: { videoSrc?: string | null }) => void) => {
      const recording = {
        phase: ref('idle'),
        secondsRemaining: ref(0),
        recordingTime: ref('00:00.0'),
        cameraEnabled: ref(false),
        microphoneEnabled: ref(false),
        systemAudioEnabled: ref(false),
        recorderHoverOnlyActive: ref(false),
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
        togglePause: vi.fn(),
        toggleCamera: vi.fn(),
        toggleMicrophone: vi.fn(),
        toggleSystemAudio: vi.fn(),
      };
      mocks.controller.recording = recording;
      mocks.controller.onComplete = onComplete;
      return recording;
    },
  };
});

vi.mock('../components/hud/HUD.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockHud',
      props: {
        preparingEditor: { type: Boolean, default: false },
        editorLoadingProgress: { type: Object, default: () => ({ stage: 'openingWindow', value: 10 }) },
      },
      emits: ['start-recording', 'open-project'],
      setup(props, { emit }) {
        return () =>
          h(
            'div',
            {
              class: 'mock-hud',
              'data-preparing-editor': String(props.preparingEditor),
              'data-editor-progress': String((props.editorLoadingProgress as { value: number }).value),
            },
            [
              h('button', {
                class: 'start',
                onClick: () =>
                  emit('start-recording', {
                    screenKind: 'display',
                    cameraId: 'off',
                    microphoneId: 'no-audio',
                    systemAudio: false,
                    targetFps: 30,
                    countdownSeconds: 0,
                    recordingBarVisibility: 'always',
                  }),
              }),
              h('button', {
                class: 'open',
                onClick: () => emit('open-project', { id: 'project-1', name: 'Project', previewSrc: 'project.mp4' }),
              }),
            ],
          );
      },
    }),
  };
});
vi.mock('../components/hud/recorder/RecorderBar.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockRecorderBar',
      props: { visibility: { type: String, default: '' } },
      emits: ['stop', 'cancel', 'pause', 'camera', 'microphone', 'system-audio'],
      setup(_, { emit }) {
        return () =>
          h('div', { class: 'mock-recorder' }, [
            h('button', { class: 'stop', onClick: () => emit('stop') }),
            h('button', { class: 'cancel', onClick: () => emit('cancel') }),
            h('button', { class: 'pause', onClick: () => emit('pause') }),
            h('button', { class: 'camera', onClick: () => emit('camera') }),
            h('button', { class: 'microphone', onClick: () => emit('microphone') }),
            h('button', { class: 'system-audio', onClick: () => emit('system-audio') }),
          ]);
      },
    }),
  };
});
vi.mock('../components/hud/camera/CameraOverlayApp.vue', async () => ({
  default: (await import('vue')).defineComponent({ template: '<div />' }),
}));
vi.mock('../components/hud/teleprompter/TeleprompterWindowApp.vue', async () => ({
  default: (await import('vue')).defineComponent({ template: '<div />' }),
}));
vi.mock('../components/ui/toast/ToastProvider.vue', async () => ({
  default: (await import('vue')).defineComponent({ template: '<div />' }),
}));

const project = { id: 'project-1', name: 'Project', previewSrc: 'project.mp4' };

let wrapper!: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => document.body) });
  mocks.capture.getPreferences.mockResolvedValue({ recordingBar: { visibility: 'auto-fade' } });
  mocks.capture.listProjects.mockResolvedValue([project]);
  mocks.capture.openEditor.mockResolvedValue(true);
  mocks.capture.onStartRecordingFromEditor.mockImplementation((listener) => {
    mocks.controller.startFromEditor = listener;
    return vi.fn();
  });
  mocks.capture.onEditorLoadingProgress.mockImplementation((listener) => {
    mocks.controller.editorProgress = listener;
    return vi.fn();
  });
  mocks.capture.onTrayStopRecording.mockReturnValue(vi.fn());
  mocks.capture.onPreferenceShortcut.mockReturnValue(vi.fn());
  wrapper = mount(App, {
    global: {
      plugins: [createPinia()],
      stubs: { Transition: false },
    },
  });
  mocks.controller.recording.start.mockImplementation(async () => {
    mocks.controller.recording.phase.value = 'recording';
  });
  mocks.controller.recording.cancel.mockImplementation(async () => {
    mocks.controller.recording.phase.value = 'idle';
  });
});

afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

const settle = async () => {
  await flushPromises();
  await nextTick();
};

describe('App', () => {
  it('loads HUD preferences and reports interactive mouse regions', async () => {
    await settle();
    expect(wrapper.find('.mock-hud').exists()).toBe(true);
    expect(mocks.capture.getPreferences).toHaveBeenCalled();

    const button = wrapper.get('button').element;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(button);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mouseleave'));
    expect(mocks.capture.setInteractive).toHaveBeenNthCalledWith(1, true);
    expect(mocks.capture.setInteractive).toHaveBeenLastCalledWith(false);
  });

  it('starts recording, routes recorder controls, and returns to HUD on cancel', async () => {
    await settle();
    expect(mocks.controller.recording.start).not.toHaveBeenCalled();
    await wrapper.get('.start').trigger('click');
    await settle();
    expect(mocks.capture.setWindowMode).toHaveBeenCalledWith('recorder');
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(true);
    expect(mocks.controller.recording.start).toHaveBeenCalledOnce();

    await wrapper.get('.pause').trigger('click');
    await wrapper.get('.camera').trigger('click');
    await wrapper.get('.microphone').trigger('click');
    await wrapper.get('.system-audio').trigger('click');
    expect(mocks.controller.recording.togglePause).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleCamera).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleMicrophone).toHaveBeenCalled();
    expect(mocks.controller.recording.toggleSystemAudio).toHaveBeenCalled();

    await wrapper.get('.cancel').trigger('click');
    await settle();
    expect(mocks.controller.recording.cancel).toHaveBeenCalled();
    expect(mocks.capture.showHud).toHaveBeenCalled();
    expect(wrapper.find('.mock-hud').exists()).toBe(true);
  });

  it('routes tray stop and the global start/stop shortcut to an active recording', async () => {
    await wrapper.get('.start').trigger('click');
    await settle();
    const trayStop = mocks.capture.onTrayStopRecording.mock.calls[0]?.[0] as (() => void) | undefined;
    const shortcut = mocks.capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;
    trayStop?.();
    shortcut?.('hud.startStopRecording');
    await settle();

    expect(mocks.controller.recording.stop).toHaveBeenCalledTimes(2);
  });

  it('opens projects, displays loading errors, and dismisses them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.capture.openEditor.mockRejectedValueOnce(new Error('project is unreadable'));
    await wrapper.get('.open').trigger('click');
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('project is unreadable');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    mocks.capture.openEditor.mockResolvedValueOnce(true);
    await wrapper.get('.open').trigger('click');
    await settle();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1');
    expect(wrapper.find('.mock-hud').exists()).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('keeps the HUD mounted and reflects real editor loading stages', async () => {
    let finishOpening!: (value: boolean) => void;
    mocks.capture.openEditor.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishOpening = resolve;
      }),
    );

    await wrapper.get('.open').trigger('click');
    await nextTick();
    expect(wrapper.get('.mock-hud').attributes('data-preparing-editor')).toBe('true');
    expect(wrapper.get('.mock-hud').attributes('data-editor-progress')).toBe('10');

    mocks.controller.editorProgress?.({ stage: 'loadingTimeline', value: 65 });
    await nextTick();
    expect(wrapper.get('.mock-hud').attributes('data-editor-progress')).toBe('65');

    finishOpening(true);
    await settle();
    expect(wrapper.get('.mock-hud').attributes('data-preparing-editor')).toBe('false');
  });

  it('opens the dedicated editor after completed recordings and reports missing projects', async () => {
    mocks.capture.listProjects.mockResolvedValueOnce([project]);
    mocks.controller.onComplete?.({ videoSrc: 'project.mp4' });
    await settle();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1');
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(false);

    mocks.capture.listProjects.mockResolvedValueOnce([]);
    mocks.controller.onComplete?.({ videoSrc: 'missing.mp4' });
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('No recorded project was found');
  });

  it('moves the HUD window into recorder mode for recordings requested by the editor', async () => {
    const configuration = {
      screenKind: 'display',
      cameraId: 'off',
      microphoneId: 'no-audio',
      systemAudio: false,
      targetFps: 30,
      countdownSeconds: 0,
      recordingBarVisibility: 'always',
    };

    mocks.controller.startFromEditor?.(configuration);
    await settle();

    expect(mocks.capture.setWindowMode).toHaveBeenCalledWith('recorder');
    expect(mocks.capture.setWindowVisible).toHaveBeenCalledWith(true);
    expect(mocks.controller.recording.start).toHaveBeenCalledWith(configuration);
  });

  it('returns immediately after an idle start and ignores mouse events outside the HUD', async () => {
    mocks.controller.recording.start.mockImplementation(async () => {
      mocks.controller.recording.phase.value = 'idle';
    });
    await wrapper.get('.start').trigger('click');
    await settle();
    expect(mocks.capture.showHud).toHaveBeenCalled();
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(true);

    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 2, clientY: 2 }));
    expect(mocks.capture.setInteractive).not.toHaveBeenCalledWith(true);
  });
});
