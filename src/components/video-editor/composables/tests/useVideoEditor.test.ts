import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioClip, ClipComposition } from '~/media/shared/composition-types';
import {
  audioClip,
  cloneComposition,
  createCompositionFixture,
  playbackMutations,
  visualMutations,
} from './useVideoEditor.test-support';

const capture = vi.hoisted(() => ({
  listBackgroundLibrary: vi.fn(),
  onBackgroundLibraryChanged: vi.fn(),
  listCursorPacks: vi.fn(),
  onCursorPacksChanged: vi.fn(),
  getEditorPresets: vi.fn(),
  onEditorPresetsChanged: vi.fn(),
}));
const toast = vi.hoisted(() => ({
  error: vi.fn(),
}));
const state = vi.hoisted(() => ({
  player: undefined as any,
  compositionState: undefined as any,
  zoomState: undefined as any,
  zoomOptions: undefined as any,
  editorState: undefined as any,
  cursor: undefined as any,
  initialComposition: undefined as ClipComposition | undefined,
  videoElementsOptions: undefined as
    | Parameters<(typeof import('../../elements/useVideoElements'))['useVideoElements']>[0]
    | undefined,
  useVideoPlayer: vi.fn(),
  createCompositionSnapshot: vi.fn(),
}));

vi.mock('../../../../api/capture', () => ({ capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));
vi.mock('../useVideoPlayer', async () => {
  const { ref } = await import('vue');
  return {
    useVideoPlayer: () => {
      const player = {
        currentTime: ref(0),
        isPlaying: ref(false),
        duration: ref(0),
        volume: ref(100),
        playbackState: ref('idle'),
        playbackError: ref(null),
        frameVersion: ref(0),
        importedBackgrounds: ref([]),
        selectedBackground: ref(null),
        selectedBackgroundMedia: ref(null),
        backgroundBlurPercent: ref(0),
        backgroundGroups: ref([]),
        setUserBackgrounds: vi.fn(),
        loadComposition: vi.fn().mockResolvedValue(undefined),
        frameFor: vi.fn().mockReturnValue(null),
        setPlaying: vi.fn().mockResolvedValue(undefined),
        seek: vi.fn().mockResolvedValue(undefined),
      };
      state.player = player;
      return player;
    },
  };
});
vi.mock('../useClipComposition', async () => {
  const { ref } = await import('vue');
  return {
    useClipComposition: () => {
      const composition = ref(
        state.initialComposition ??
          ({ schemaVersion: 6, assets: [], clips: [], keyboardCaptionSessions: [] } as ClipComposition),
      );
      const value = { composition, synchronizeRecording: vi.fn(), addElement: vi.fn().mockResolvedValue('image-1') };
      state.compositionState = value;
      return value;
    },
  };
});
vi.mock('../useProjectZoom', async () => {
  const { ref } = await import('vue');
  return {
    useProjectZoom: (options: unknown) => {
      state.zoomOptions = options;
      const value = {
        zoomElements: ref([]),
        generatedSessions: ref([]),
        selectedZoomId: ref(null),
        ensureAutomaticZooms: vi.fn(),
      };
      state.zoomState = value;
      return value;
    },
  };
});
vi.mock('../useProjectEditorState', () => ({
  useProjectEditorState: () => {
    const value = {
      load: vi.fn().mockResolvedValue(undefined),
      scheduleSave: vi.fn(),
      enableDefaultCapture: vi.fn(),
    };
    state.editorState = value;
    return value;
  },
}));
vi.mock('../../elements/useVideoElements', () => ({
  useVideoElements: (options: NonNullable<typeof state.videoElementsOptions>) => {
    state.videoElementsOptions = options;
    return {};
  },
}));
vi.mock('../../properties/cursor/useCursorReplacer', async () => {
  const { computed, ref } = await import('vue');
  return {
    useCursorReplacer: () => {
      const value = {
        selection: ref({ packId: 'builtin:macos', mode: 'automatic', cursorId: null }),
        importedPacks: ref([]),
        packs: computed(() => []),
        selectedPack: computed(() => null),
        cursorSize: ref(24),
        cursorColor: ref('#ffffff'),
        enableShadow: ref(true),
        shadowBlur: ref(8),
        shadowColor: ref('#000000'),
        shadowDirection: ref('bottom-right'),
        clickEffects: ref({ left: {}, right: {} }),
        autoHide: ref({ enabled: false, delaySeconds: 2, fadeDurationMs: 250 }),
      };
      state.cursor = value;
      return value;
    },
  };
});
vi.mock('../../../export/composition/snapshot', () => ({
  createCompositionSnapshot: (...args: unknown[]) => {
    state.createCompositionSnapshot(...args);
    return { snapshot: true };
  },
}));
import { useVideoEditor } from '../useVideoEditor';

const project = { id: 'project-1', name: 'Demo project' } as any;
const makeEditorData = (fps = 60) => ({ tracks: [{ kind: 'screen', format: { frameRate: fps } }] }) as any;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useVideoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.initialComposition = undefined;
    state.zoomOptions = undefined;
    capture.listBackgroundLibrary.mockResolvedValue([{ id: 'background-1' }]);
    capture.onBackgroundLibraryChanged.mockReturnValue(() => undefined);
    capture.listCursorPacks.mockResolvedValue([]);
    capture.onCursorPacksChanged.mockReturnValue(() => undefined);
    capture.getEditorPresets.mockResolvedValue({ schemaVersion: 1, activePresetId: 'default', presets: [] });
    capture.onEditorPresetsChanged.mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects the shared Image element action to Studio media import and reports import failures', async () => {
    const Harness = defineComponent({
      setup: () => {
        useVideoEditor({ project: ref(project), editorData: ref(makeEditorData()) });
        return {};
      },
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();
    expect(state.videoElementsOptions?.addImage).toBeTypeOf('function');
    await state.videoElementsOptions!.addImage!();
    expect(state.compositionState.addElement).toHaveBeenCalledWith('image');
    state.zoomState.selectedZoomId.value = 'zoom-1';
    state.videoElementsOptions!.clearZoom();
    expect(state.zoomState.selectedZoomId.value).toBeNull();
    state.compositionState.addElement.mockRejectedValueOnce(new Error('Image unreadable'));
    await state.videoElementsOptions!.addImage!();
    expect(toast.error).toHaveBeenCalledWith('Error: Image unreadable');
    wrapper.unmount();
  });

  it('exposes cheap live export metadata and creates snapshots only when requested', async () => {
    let api!: ReturnType<typeof useVideoEditor>;
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
    const initialComposition = createCompositionFixture();
    const screenClip = initialComposition.clips.find((clip) => clip.id === 'screen')!;
    screenClip.timelineDurationMs = 2_000;
    screenClip.sourceDurationMs = 2_000;
    initialComposition.clips = [screenClip];
    state.initialComposition = initialComposition;
    const Harness = defineComponent({
      setup: () => ((api = useVideoEditor({ project: projectRef, editorData })), {}),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();
    expect(state.player.loadComposition).toHaveBeenCalledWith(state.compositionState.composition.value);
    expect(state.player.setUserBackgrounds).toHaveBeenCalledWith([{ id: 'background-1' }]);
    expect(state.editorState.load).toHaveBeenCalledWith('project-1');
    expect(capture.onBackgroundLibraryChanged).toHaveBeenCalledOnce();
    expect(api.exportRequest.value).toMatchObject({
      projectName: 'Demo project',
      includeAudio: true,
      duration: 2,
      fps: 60,
      width: 1920,
      height: 1080,
    });
    expect(state.createCompositionSnapshot).not.toHaveBeenCalled();
    api.exportRequest.value!.createSnapshot();
    expect(state.createCompositionSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fps: 60,
        canvas: expect.objectContaining({ width: 1920, height: 1080 }),
      }),
    );

    state.cursor.cursorSize.value = 17;
    state.cursor.selection.value = { packId: 'builtin:macos', mode: 'fixed', cursorId: 'handpointing' };
    state.cursor.autoHide.value = { enabled: true, delaySeconds: 4, fadeDurationMs: 500 };
    api.cursorMotion.value = {
      preset: 'custom',
      smoothing: 0,
      springMassMultiplier: 0.5,
      motionBlur: 0,
    };
    api.exportRequest.value!.createSnapshot();
    expect(state.createCompositionSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursorSettings: expect.objectContaining({
          selection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'handpointing' },
          size: 17,
          autoHide: { enabled: true, delaySeconds: 4, fadeDurationMs: 500 },
          motion: {
            preset: 'custom',
            smoothing: 0,
            springMassMultiplier: 0.5,
            motionBlur: 0,
          },
        }),
      }),
    );

    api.outputCanvas.value = { ...api.outputCanvas.value, width: 1280, height: 720 };
    api.includeAudioInExport.value = false;
    editorData.value = makeEditorData(24);
    state.compositionState.composition.value = createCompositionFixture();
    await wrapper.vm.$nextTick();

    expect(api.exportRequest.value).toMatchObject({
      includeAudio: false,
      duration: 5,
      fps: 24,
      width: 1280,
      height: 720,
    });
    expect(state.createCompositionSnapshot).toHaveBeenCalledTimes(2);
    api.exportRequest.value!.createSnapshot();
    expect(state.createCompositionSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        duration: 5,
        fps: 24,
        canvas: expect.objectContaining({ width: 1280, height: 720 }),
        composition: state.compositionState.composition.value,
      }),
    );

    api.handleSelectTab('zoom');
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(state.player.loadComposition).toHaveBeenLastCalledWith(state.compositionState.composition.value);
    expect(api.activeTab.value).toBe('zoom');
    projectRef.value = null;
    await wrapper.vm.$nextTick();
    expect(api.exportRequest.value).toBeNull();
    wrapper.unmount();
  });

  it('shows an actionable toast when loading the editor state fails with an Error', async () => {
    const failure = new Error('project state is corrupt');
    state.editorState = undefined;
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(Harness);
    state.editorState.load.mockRejectedValueOnce(failure);

    projectRef.value = { ...project, id: 'project-2' };
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('Failed to load editor state.', failure);
    expect(toast.error).toHaveBeenCalledWith(
      'Failed to load editor state: project state is corrupt',
      0,
      expect.objectContaining({
        label: 'Copy error',
        copyText: expect.stringContaining('Error: project state is corrupt'),
        detail: 'project state is corrupt',
      }),
    );
    wrapper.unmount();
  });

  it('shows a copyable toast when editor state loading rejects with a non-Error value', async () => {
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = mount(Harness);
    state.editorState.load.mockRejectedValueOnce('invalid editor payload');

    projectRef.value = { ...project, id: 'project-3' };
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('Failed to load editor state.', 'invalid editor payload');
    expect(toast.error).toHaveBeenCalledWith('Failed to load editor state: invalid editor payload', 0, {
      label: 'Copy error',
      copyText: 'invalid editor payload',
      detail: 'invalid editor payload',
    });
    wrapper.unmount();
  });

  it('ignores a slow preset load after switching to a newer project', async () => {
    const slowPresetLoad = deferred<any>();
    capture.getEditorPresets.mockReturnValueOnce(slowPresetLoad.promise).mockResolvedValueOnce({
      schemaVersion: 1,
      activePresetId: 'default',
      presets: [],
    });
    const projectRef = ref({ ...project, id: 'project-slow' });
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const wrapper = mount(Harness);

    projectRef.value = { ...project, id: 'project-current' };
    await flushPromises();
    expect(state.editorState.load).toHaveBeenCalledWith('project-current');

    slowPresetLoad.resolve({ schemaVersion: 1, activePresetId: 'default', presets: [] });
    await flushPromises();

    expect(state.editorState.load).not.toHaveBeenCalledWith('project-slow');
    expect(state.editorState.enableDefaultCapture).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('does not enable defaults from an editor-state load superseded by a project switch', async () => {
    const staleStateLoad = deferred<void>();
    const projectRef = ref({ ...project, id: 'project-slow-state' });
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    state.editorState.load.mockImplementation((id: string) =>
      id === 'project-slow-state' ? staleStateLoad.promise : Promise.resolve(),
    );
    await flushPromises();
    expect(state.editorState.load).toHaveBeenCalledWith('project-slow-state');

    projectRef.value = { ...project, id: 'project-latest-state' };
    await flushPromises();
    expect(state.editorState.load).toHaveBeenCalledWith('project-latest-state');
    expect(state.editorState.enableDefaultCapture).toHaveBeenCalledOnce();

    staleStateLoad.resolve();
    await flushPromises();
    expect(state.editorState.enableDefaultCapture).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('passes composition duration to zoom generation before player metadata is ready', async () => {
    state.initialComposition = createCompositionFixture();
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();

    expect(state.player.duration.value).toBe(0);
    expect(state.zoomOptions.durationMs.value).toBe(5_000);
    wrapper.unmount();
  });

  it('retries automatic zoom generation when editor data arrives after project loading', async () => {
    const projectRef = ref(project);
    const editorData = ref(null);
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();
    state.zoomState.ensureAutomaticZooms.mockClear();

    editorData.value = { ...makeEditorData(), sessionId: 'session-1', cursor: { available: true } } as any;
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(state.zoomState.ensureAutomaticZooms).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  const mountWithComposition = async (initialComposition = createCompositionFixture()) => {
    state.initialComposition = initialComposition;
    let api!: ReturnType<typeof useVideoEditor>;
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
    const Harness = defineComponent({
      setup: () => ((api = useVideoEditor({ project: projectRef, editorData })), {}),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();
    expect(state.player.loadComposition).toHaveBeenCalledOnce();
    state.player.loadComposition.mockClear();
    return { api, wrapper };
  };

  const flushCompositionWatcher = async (wrapper: { vm: { $nextTick: () => Promise<void> } }) => {
    await wrapper.vm.$nextTick();
    await flushPromises();
  };

  it('derives system and microphone volumes from loaded clips and updates only their own roles', async () => {
    const composition = createCompositionFixture();
    composition.clips.push(
      audioClip('system-audio-a', 'audio-asset', { role: 'system', volume: 63 }),
      audioClip('system-audio-b', 'audio-asset', { role: 'system', volume: 63 }),
      audioClip('microphone-audio-a', 'audio-asset', { role: 'microphone', volume: 41 }),
      audioClip('microphone-audio-b', 'audio-asset', { role: 'microphone', volume: 41 }),
    );
    const { api, wrapper } = await mountWithComposition(composition);
    const volumeOf = (id: string) =>
      (state.compositionState.composition.value.clips.find((clip: { id: string }) => clip.id === id) as AudioClip)
        .volume;

    expect(api.systemVolume.value).toBe(63);
    expect(api.micVolume.value).toBe(41);

    api.systemVolume.value = 77;
    await wrapper.vm.$nextTick();
    expect(volumeOf('system-audio-a')).toBe(77);
    expect(volumeOf('system-audio-b')).toBe(77);
    expect(volumeOf('microphone-audio-a')).toBe(41);
    expect(volumeOf('microphone-audio-b')).toBe(41);

    api.micVolume.value = 29;
    await wrapper.vm.$nextTick();
    expect(volumeOf('system-audio-a')).toBe(77);
    expect(volumeOf('system-audio-b')).toBe(77);
    expect(volumeOf('microphone-audio-a')).toBe(29);
    expect(volumeOf('microphone-audio-b')).toBe(29);
    expect(volumeOf('imported-audio')).toBe(100);
    wrapper.unmount();
  });

  it('uses full volume when the recording has no system or microphone clips', async () => {
    const { api, wrapper } = await mountWithComposition();

    expect(api.systemVolume.value).toBe(100);
    expect(api.micVolume.value).toBe(100);
    wrapper.unmount();
  });

  it('uses the screen FPS field when frameRate is absent and falls back for invalid metadata', async () => {
    const projectRef = ref(project);
    const sourceData = ref({ tracks: [] } as any);
    let sourceApi!: ReturnType<typeof useVideoEditor>;
    const Harness = defineComponent({
      setup: () => ((sourceApi = useVideoEditor({ project: projectRef, editorData: sourceData })), {}),
      template: '<div />',
    });
    const sourceWrapper = mount(Harness);
    await flushPromises();
    expect(sourceApi.exportRequest.value?.fps).toBe(30);

    sourceData.value = { tracks: [{ kind: 'screen', format: { fps: 48 } }] } as any;
    await sourceWrapper.vm.$nextTick();
    expect(sourceApi.exportRequest.value?.fps).toBe(48);

    sourceData.value = { tracks: [{ kind: 'screen', format: { frameRate: 0, fps: 24 } }] } as any;
    await sourceWrapper.vm.$nextTick();
    expect(sourceApi.exportRequest.value?.fps).toBe(30);
    sourceData.value = { tracks: [{ kind: 'screen', format: { frameRate: Number.NaN } }] } as any;
    await sourceWrapper.vm.$nextTick();
    expect(sourceApi.exportRequest.value?.fps).toBe(30);
    sourceData.value = { tracks: [{ kind: 'audio', format: { frameRate: 30 } }] } as any;
    await sourceWrapper.vm.$nextTick();
    expect(sourceApi.exportRequest.value?.fps).toBe(30);
    sourceWrapper.unmount();
  });

  it.each(visualMutations)('keeps the loaded media for a visual-only %s mutation', async (_name, mutate) => {
    const { wrapper } = await mountWithComposition();
    const next = cloneComposition(state.compositionState.composition.value);
    mutate(next);
    state.compositionState.composition.value = next;

    await flushCompositionWatcher(wrapper);

    expect(state.player.loadComposition).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each(playbackMutations)('reloads media for a playback-affecting %s mutation', async (_name, mutate) => {
    const { wrapper } = await mountWithComposition();
    const next = cloneComposition(state.compositionState.composition.value);
    mutate(next);
    state.compositionState.composition.value = next;

    await flushCompositionWatcher(wrapper);

    expect(state.player.loadComposition).toHaveBeenCalledOnce();
    expect(state.player.loadComposition).toHaveBeenCalledWith(state.compositionState.composition.value);
    wrapper.unmount();
  });

  it('refreshes the background library from the native subscription and tolerates failures', async () => {
    let refresh!: () => void;
    const unsubscribe = vi.fn();
    capture.listBackgroundLibrary
      .mockRejectedValueOnce(new Error('library unavailable'))
      .mockResolvedValueOnce([{ id: 'later' }]);
    capture.onBackgroundLibraryChanged.mockImplementation((listener) => {
      refresh = listener;
      return unsubscribe;
    });
    const projectRef = ref(null);
    const editorData = ref(null);
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: projectRef, editorData }),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();
    refresh();
    await flushPromises();
    expect(state.player.setUserBackgrounds).toHaveBeenCalledWith([{ id: 'later' }]);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('retries camera-pack discovery from its subscription and releases the listener', async () => {
    let refresh!: () => void;
    const unsubscribe = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    capture.listCursorPacks
      .mockRejectedValueOnce(new Error('camera packs unavailable'))
      .mockResolvedValueOnce([{ id: 'camera-pack' }]);
    capture.onCursorPacksChanged.mockImplementation((listener) => {
      refresh = listener;
      return unsubscribe;
    });
    const Harness = defineComponent({
      setup: () => useVideoEditor({ project: ref(null), editorData: ref(null) }),
      template: '<div />',
    });
    const wrapper = mount(Harness);
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith('Failed to load cursor packs.');
    refresh();
    await flushPromises();
    expect(state.cursor.importedPacks.value).toEqual([{ id: 'camera-pack' }]);

    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('suppresses a stale playback failure after a newer composition load succeeds', async () => {
    const { wrapper } = await mountWithComposition();
    const staleLoad = deferred<void>();
    const failure = new Error('old media decode failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.player.loadComposition.mockImplementationOnce(() => staleLoad.promise).mockResolvedValueOnce(undefined);

    const first = cloneComposition(state.compositionState.composition.value);
    first.clips.find((clip: { id: string }) => clip.id === 'imported-video')!.timelineStartMs += 100;
    state.compositionState.composition.value = first;
    await flushCompositionWatcher(wrapper);
    const second = cloneComposition(first);
    second.clips.find((clip: { id: string }) => clip.id === 'imported-video')!.timelineStartMs += 100;
    state.compositionState.composition.value = second;
    await flushCompositionWatcher(wrapper);

    staleLoad.reject(failure);
    await flushPromises();
    expect(consoleError).not.toHaveBeenCalled();
    wrapper.unmount();
    consoleError.mockRestore();
  });

  it('reports a current playback failure instead of swallowing it as a stale load', async () => {
    const { wrapper } = await mountWithComposition();
    const failure = new Error('current video decode failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    state.player.loadComposition.mockRejectedValueOnce(failure);

    const next = cloneComposition(state.compositionState.composition.value);
    next.clips.find((clip: { id: string }) => clip.id === 'imported-video')!.sourceInMs += 250;
    state.compositionState.composition.value = next;
    await flushCompositionWatcher(wrapper);

    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('composition watcher load failed'));
    expect(consoleError.mock.calls[0]?.[0]).toContain('current video decode failed');
    wrapper.unmount();
    consoleError.mockRestore();
  });
});
