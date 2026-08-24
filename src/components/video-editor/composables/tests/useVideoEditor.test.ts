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
  useVideoPlayer: vi.fn(),
  createCompositionSnapshot: vi.fn(),
  compositionDurationMs: vi.fn(),
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
      const value = { composition, synchronizeRecording: vi.fn() };
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
const makeEditorData = () => ({ tracks: [{ kind: 'screen', format: { frameRate: 60 } }] }) as any;

describe('useVideoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.initialComposition = undefined;
    state.zoomOptions = undefined;
    capture.listBackgroundLibrary.mockResolvedValue([{ id: 'background-1' }]);
    capture.onBackgroundLibraryChanged.mockReturnValue(() => undefined);
    capture.listCursorPacks.mockResolvedValue([]);
    capture.onCursorPacksChanged.mockReturnValue(() => undefined);
    state.compositionDurationMs.mockReturnValue(2000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes dependencies, synchronizes source/project changes and builds export data', async () => {
    let api!: ReturnType<typeof useVideoEditor>;
    const projectRef = ref(project);
    const editorData = ref(makeEditorData());
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
      snapshot: { snapshot: true },
    });
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
    void api.exportRequest.value;
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

    state.compositionState.composition.value = createCompositionFixture();
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
    capture.listBackgroundLibrary
      .mockRejectedValueOnce(new Error('library unavailable'))
      .mockResolvedValueOnce([{ id: 'later' }]);
    capture.onBackgroundLibraryChanged.mockImplementation((listener) => {
      refresh = listener;
      return vi.fn();
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
  });
});
