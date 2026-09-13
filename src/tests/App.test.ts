import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import type { RecordingSessionResult } from '../components/hud/recorder/recording-types';
import { setCurrentLocale } from '../i18n';

const mocks = vi.hoisted(() => ({
  capture: {
    platform: 'win32',
    getPreferences: vi.fn(),
    getUpdateState: vi.fn(),
    setInteractive: vi.fn(),
    setCameraOverlayActive: vi.fn(),
    setNormalRecordingActive: vi.fn(),
    hideScreenRegionOverlay: vi.fn(),
    setCountdown: vi.fn(async () => undefined),
    resetCameraOverlayPlacement: vi.fn(),
    setWindowMode: vi.fn(),
    setSize: vi.fn(),
    setWindowVisible: vi.fn(),
    showHud: vi.fn(),
    hideTeleprompter: vi.fn(),
    openEditor: vi.fn(),
    openScreenshot: vi.fn(),
    dismissRecorderLauncher: vi.fn(),
    setRecorderLauncherActive: vi.fn(),
    onRecorderLauncherContext: vi.fn(),
    onEditorLoadingProgress: vi.fn(),
    onTrayStopRecording: vi.fn(),
    onPreferenceShortcut: vi.fn(),
    listProjects: vi.fn(),
    renameProject: vi.fn(),
    updateTrayMenu: vi.fn(),
  },
  controller: {
    recording: undefined as any,
    onComplete: undefined as ((session: RecordingSessionResult) => void) | undefined,
    recorderLauncherContext: undefined as
      | ((context: { requestId: string; preferredKind: 'window'; preferredSourceId: string | null } | null) => void)
      | undefined,
    editorProgress: undefined as ((progress: { stage: string; value: number }) => void) | undefined,
  },
}));

vi.mock('../api/capture', () => ({ capture: mocks.capture }));

vi.mock('../components/hud/recorder/useRecordingController', async () => {
  const { ref } = await import('vue');
  return {
    useRecordingController: (onComplete: (session: RecordingSessionResult) => void, _onFailure?: unknown) => {
      const recording = {
        phase: ref('idle'),
        secondsRemaining: ref(0),
        recordingTime: ref('00:00.0'),
        cameraEnabled: ref(false),
        microphoneEnabled: ref(false),
        systemAudioEnabled: ref(false),
        systemAudioLevel: ref(0),
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
        recorderLauncherContext: { type: Object, default: null },
      },
      emits: ['start-recording', 'open-project', 'dismiss-launcher'],
      setup(props, { emit }) {
        return () =>
          h(
            'div',
            {
              class: 'mock-hud',
              'data-preparing-editor': String(props.preparingEditor),
              'data-editor-progress': String((props.editorLoadingProgress as { value: number }).value),
              'data-launcher-kind': props.recorderLauncherContext?.preferredKind ?? '',
              'data-launcher-source': props.recorderLauncherContext?.preferredSourceId ?? '',
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
                onClick: () =>
                  emit('open-project', {
                    id: 'project-1',
                    name: 'Project',
                    previewSrc: 'project.mp4',
                    mode: 'studio',
                  }),
              }),
              ...(props.recorderLauncherContext
                ? [h('button', { class: 'dismiss-launcher', onClick: () => emit('dismiss-launcher') })]
                : []),
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

const project = { id: 'project-1', name: 'Project', previewSrc: 'project.mp4', mode: 'studio' as const };

let wrapper!: VueWrapper;

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentLocale('en');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => document.body) });
  mocks.capture.getPreferences.mockResolvedValue({ recordingBar: { visibility: 'auto-fade' } });
  mocks.capture.getUpdateState.mockResolvedValue({
    status: 'unsupported',
    currentVersion: '0.2.9-test',
    availableVersion: null,
    percent: null,
    message: null,
  });
  mocks.capture.listProjects.mockResolvedValue([project]);
  mocks.capture.openEditor.mockResolvedValue(true);
  mocks.capture.openScreenshot.mockResolvedValue(true);
  mocks.capture.dismissRecorderLauncher.mockResolvedValue(true);
  mocks.capture.onRecorderLauncherContext.mockImplementation((listener) => {
    mocks.controller.recorderLauncherContext = listener;
    return vi.fn();
  });
  mocks.capture.renameProject.mockResolvedValue(project);
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

  it('keeps the camera overlay active until recording stop succeeds', async () => {
    await wrapper.get('.start').trigger('click');
    await settle();
    mocks.capture.setCameraOverlayActive.mockClear();

    let finishStop!: () => void;
    const stopFinished = new Promise<void>((resolve) => {
      finishStop = () => {
        mocks.controller.recording.phase.value = 'idle';
        mocks.controller.onComplete?.({ videoSrc: 'project.mp4', sessionId: 'session-stop' });
        resolve();
      };
    });
    mocks.controller.recording.stop.mockReturnValueOnce(stopFinished);

    const stopping = wrapper.get('.stop').trigger('click');
    await nextTick();
    expect(mocks.capture.setCameraOverlayActive).not.toHaveBeenCalledWith(false);

    finishStop();
    await stopping;
    await settle();
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(false);
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

  it('routes the pause/resume shortcut only while recording or paused', async () => {
    const shortcut = mocks.capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;
    expect(shortcut).toBeDefined();

    for (const phase of ['idle', 'countdown', 'starting', 'finalizing'] as const) {
      mocks.controller.recording.phase.value = phase;
      shortcut?.('hud.playPause');
    }
    expect(mocks.controller.recording.togglePause).not.toHaveBeenCalled();

    mocks.controller.recording.phase.value = 'recording';
    shortcut?.('hud.playPause');
    await settle();
    mocks.controller.recording.phase.value = 'paused';
    shortcut?.('hud.playPause');
    await settle();
    expect(mocks.controller.recording.togglePause).toHaveBeenCalledTimes(2);
    expect(mocks.controller.recording.stop).not.toHaveBeenCalled();
  });

  it('ignores duplicate pause/resume shortcuts while pending and accepts the next event after resolving', async () => {
    let resolveToggle!: () => void;
    const pendingToggle = new Promise<void>((resolve) => {
      resolveToggle = resolve;
    });
    mocks.controller.recording.togglePause.mockReturnValueOnce(pendingToggle);
    mocks.controller.recording.phase.value = 'recording';
    const shortcut = mocks.capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;

    shortcut?.('hud.playPause');
    shortcut?.('hud.playPause');
    expect(mocks.controller.recording.togglePause).toHaveBeenCalledOnce();

    resolveToggle();
    await settle();
    shortcut?.('hud.playPause');
    await settle();
    expect(mocks.controller.recording.togglePause).toHaveBeenCalledTimes(2);
  });

  it('re-enables pause/resume shortcuts after a rejected toggle', async () => {
    let rejectToggle!: (reason?: unknown) => void;
    const pendingToggle = new Promise<void>((_, reject) => {
      rejectToggle = reject;
    });
    const error = new Error('pause unavailable');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.controller.recording.togglePause.mockReturnValueOnce(pendingToggle);
    mocks.controller.recording.phase.value = 'paused';
    const shortcut = mocks.capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;

    shortcut?.('hud.playPause');
    shortcut?.('hud.playPause');
    expect(mocks.controller.recording.togglePause).toHaveBeenCalledOnce();

    rejectToggle(error);
    await settle();
    expect(errorSpy).toHaveBeenCalledWith('Failed to toggle recording pause from shortcut:', error);
    shortcut?.('hud.playPause');
    await settle();
    expect(mocks.controller.recording.togglePause).toHaveBeenCalledTimes(2);
  });

  it('ignores unknown shortcut actions and keeps start/stop routing limited to valid phases', async () => {
    const shortcut = mocks.capture.onPreferenceShortcut.mock.calls[0]?.[0] as ((action: string) => void) | undefined;
    expect(shortcut).toBeDefined();

    for (const phase of ['idle', 'finalizing'] as const) {
      mocks.controller.recording.phase.value = phase;
      shortcut?.('hud.startStopRecording');
    }
    mocks.controller.recording.phase.value = 'recording';
    shortcut?.('hud.unknown');
    expect(mocks.controller.recording.stop).not.toHaveBeenCalled();
    expect(mocks.controller.recording.cancel).not.toHaveBeenCalled();

    for (const phase of ['countdown', 'starting', 'recording', 'paused'] as const) {
      mocks.controller.recording.phase.value = phase;
      shortcut?.('hud.startStopRecording');
    }
    await settle();
    expect(mocks.controller.recording.stop).toHaveBeenCalledTimes(4);
  });

  it('opens projects, displays loading errors, and dismisses them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.capture.openEditor.mockRejectedValueOnce(new Error('project is unreadable'));
    await wrapper.get('.open').trigger('click');
    await settle();
    expect(wrapper.get('[role="alert"]').text()).not.toContain('project is unreadable');
    await wrapper.findAll('[role="alert"] button').at(-1)!.trigger('click');
    await settle();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    mocks.capture.openEditor.mockResolvedValueOnce(true);
    await wrapper.get('.open').trigger('click');
    await settle();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1', { disposition: 'reuse' });
    expect(wrapper.find('.mock-hud').exists()).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('shows a translated editor-open failure and copies its complete diagnostics', async () => {
    setCurrentLocale('fr');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
    let rejectOpening!: (error: Error) => void;
    mocks.capture.openEditor.mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        rejectOpening = reject;
      }),
    );

    try {
      await wrapper.get('.open').trigger('click');
      await nextTick();
      mocks.controller.editorProgress?.({ stage: 'loadingTimeline', value: 60 });
      rejectOpening(new Error('diagnostic détaillé'));
      await settle();

      const error = wrapper.get('[role="alert"]');
      expect(error.text()).toContain('Impossible d’ouvrir l’éditeur');
      expect(error.text()).toContain(
        'Beam n’a pas reçu le signal de disponibilité de l’éditeur. Votre enregistrement est toujours conservé.',
      );
      expect(error.text()).toContain('Dernière étape signalée : Chargement de la timeline…');
      expect(error.text()).toContain('Retour à Beam');
      expect(error.text()).not.toContain('diagnostic détaillé');
      expect(error.text()).not.toContain('Error:');

      const copy = error.get('[aria-label="Copier le diagnostic"]');
      await copy.trigger('click');
      await settle();

      expect(clipboardWriteText).toHaveBeenCalledOnce();
      const diagnostics = clipboardWriteText.mock.calls[0]![0];
      expect(diagnostics).toContain('=== Beam Editor Open Diagnostics ===');
      expect(diagnostics).toContain('App version: 0.2.9-test');
      expect(diagnostics).toContain('Runtime platform: win32');
      expect(diagnostics).toContain('Project ID: project-1');
      expect(diagnostics).toContain('Project mode: studio');
      expect(diagnostics).toContain('Last reported stage: loadingTimeline (60%)');
      expect(diagnostics).toMatch(/^Occurred at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m);
      expect(diagnostics).toContain(`User agent: ${navigator.userAgent}`);
      expect(diagnostics).toContain('Error: diagnostic détaillé');
      expect(copy.attributes('data-state')).toBe('copied');
      expect(copy.attributes('aria-label')).toBe('Diagnostic copié');
    } finally {
      errorSpy.mockRestore();
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
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

    mocks.controller.editorProgress?.({ stage: 'loadingTimeline', value: 60 });
    await nextTick();
    expect(wrapper.get('.mock-hud').attributes('data-editor-progress')).toBe('60');

    mocks.controller.editorProgress?.({ stage: 'ready', value: 100 });
    expect(mocks.capture.setWindowVisible).not.toHaveBeenCalledWith(false);

    finishOpening(true);
    await settle();
    expect(wrapper.get('.mock-hud').attributes('data-preparing-editor')).toBe('false');
  });

  it('opens the dedicated editor after completed recordings and reports missing projects', async () => {
    mocks.capture.listProjects.mockResolvedValueOnce([project]);
    mocks.controller.onComplete?.({ videoSrc: 'project.mp4', sessionId: 'session-1' });
    await settle();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1', { disposition: 'reuse' });
    expect(mocks.capture.setCameraOverlayActive).toHaveBeenCalledWith(false);

    mocks.capture.listProjects.mockResolvedValueOnce([]);
    mocks.controller.onComplete?.({ videoSrc: 'missing.mp4', sessionId: 'session-2' });
    await settle();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).not.toContain('No recorded project was found');
  });

  it('passes the editor launcher context to HUD and prefers the requested window source', async () => {
    const context = {
      requestId: 'launcher-1',
      preferredKind: 'window' as const,
      preferredSourceId: 'window:editor',
    };

    mocks.controller.recorderLauncherContext?.(context);
    await nextTick();

    const hud = wrapper.get('.mock-hud');
    expect(hud.attributes('data-launcher-kind')).toBe('window');
    expect(hud.attributes('data-launcher-source')).toBe('window:editor');
  });

  it('dismisses the editor launcher without opening an editor window', async () => {
    mocks.controller.recorderLauncherContext?.({
      requestId: 'launcher-2',
      preferredKind: 'window',
      preferredSourceId: 'window:editor',
    });
    await nextTick();

    await wrapper.get('.dismiss-launcher').trigger('click');
    await settle();

    expect(mocks.capture.dismissRecorderLauncher).toHaveBeenCalledOnce();
    expect(mocks.capture.openEditor).not.toHaveBeenCalled();
    expect(wrapper.get('.mock-hud').attributes('data-launcher-source')).toBe('');
  });

  it('opens a completed editor-launched recording in a new editor window', async () => {
    const configuration = {
      screenKind: 'display',
      cameraId: 'off',
      microphoneId: 'no-audio',
      systemAudio: false,
      targetFps: 30,
      countdownSeconds: 0,
      recordingBarVisibility: 'always',
    };

    mocks.controller.recorderLauncherContext?.({
      requestId: 'launcher-3',
      preferredKind: 'window',
      preferredSourceId: 'window:editor',
    });
    await nextTick();
    await wrapper.get('.start').trigger('click');
    await settle();

    expect(mocks.capture.setWindowMode).toHaveBeenCalledWith('recorder');
    expect(mocks.controller.recording.start).toHaveBeenCalledWith(configuration);

    mocks.controller.onComplete?.({ videoSrc: 'project.mp4', sessionId: 'session-3' });
    await settle();

    expect(mocks.capture.openEditor).toHaveBeenCalledWith('project-1', { disposition: 'new-window' });
  });

  it('resolves editor-launched recordings by projectId when file and preview URLs differ', async () => {
    const previousProject = { id: 'project-old', name: 'Old project', previewSrc: 'project-media://old' };
    const recordedProject = { id: 'project-new', name: 'New project', previewSrc: 'project-media://new' };
    mocks.capture.listProjects.mockResolvedValueOnce([previousProject, recordedProject]);
    mocks.capture.renameProject.mockResolvedValueOnce({ ...recordedProject, name: 'DEBUG New project' });
    mocks.controller.recorderLauncherContext?.({
      requestId: 'launcher-project-id',
      preferredKind: 'window',
      preferredSourceId: 'window:editor',
    });
    await nextTick();
    await wrapper.get('.start').trigger('click');
    await settle();

    mocks.controller.onComplete?.({
      projectId: recordedProject.id,
      sessionId: 'session-project-id',
      videoSrc: 'file:///recordings/new.mp4',
    });
    await settle();

    expect(mocks.capture.renameProject).toHaveBeenCalledWith(recordedProject.id, 'DEBUG New project');
    expect(mocks.capture.renameProject).not.toHaveBeenCalledWith(previousProject.id, expect.any(String));
    expect(mocks.capture.openEditor).toHaveBeenCalledWith(recordedProject.id, { disposition: 'new-window' });
  });

  it('does not open the first project when a completed projectId is unknown', async () => {
    mocks.capture.listProjects.mockResolvedValueOnce([project]);

    mocks.controller.onComplete?.({
      projectId: 'project-missing',
      sessionId: 'session-missing-project',
      videoSrc: 'file:///recordings/missing-project.mp4',
    });
    await settle();

    expect(mocks.capture.openEditor).not.toHaveBeenCalled();
    expect(mocks.capture.renameProject).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).not.toContain('No recorded project was found');
  });

  it('clears the editor launcher context when no project exists after recording', async () => {
    mocks.controller.recorderLauncherContext?.({
      requestId: 'launcher-no-project',
      preferredKind: 'window',
      preferredSourceId: 'window:editor',
    });
    await nextTick();
    await wrapper.get('.start').trigger('click');
    await settle();

    mocks.capture.listProjects.mockResolvedValueOnce([]);
    mocks.controller.onComplete?.({ videoSrc: 'missing.mp4', sessionId: 'session-4' });
    await settle();

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).not.toContain('No recorded project was found');
    await wrapper.findAll('[role="alert"] button').at(-1)!.trigger('click');
    await settle();

    expect(wrapper.get('.mock-hud').attributes('data-launcher-source')).toBe('');
    expect(mocks.capture.dismissRecorderLauncher).toHaveBeenCalledOnce();
    expect(mocks.capture.openEditor).not.toHaveBeenCalled();
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
  it('resolves the recorded project by ID ahead of newer screenshots and other recordings', async () => {
    mocks.capture.listProjects.mockResolvedValueOnce([
      { id: 'image', name: 'Screenshot', mode: 'screenshot', previewSrc: null },
      { id: 'other', name: 'Other recording', mode: 'studio', previewSrc: 'other.mp4' },
      { id: 'recorded', name: 'Recorded', mode: 'studio', previewSrc: 'recorded.mp4' },
    ]);
    mocks.controller.onComplete?.({ projectId: 'recorded', videoSrc: null });
    await settle();
    expect(mocks.capture.openEditor).toHaveBeenCalledWith('recorded', { disposition: 'reuse' });
    expect(mocks.capture.openScreenshot).not.toHaveBeenCalled();
  });
});
