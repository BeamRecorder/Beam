import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({
  listBackgroundLibrary: vi.fn(),
  onBackgroundLibraryChanged: vi.fn(),
}));
const state = vi.hoisted(() => ({
  player: undefined as any,
  compositionState: undefined as any,
  zoomState: undefined as any,
  editorState: undefined as any,
  cursor: undefined as any,
  useVideoPlayer: vi.fn(),
  createCompositionSnapshot: vi.fn(),
  compositionDurationMs: vi.fn(),
}));

vi.mock('../../../../api/capture', () => ({ capture }));
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
      const composition = ref({ schemaVersion: 1, assets: [], clips: [] });
      const value = { composition, synchronizeRecording: vi.fn() };
      state.compositionState = value;
      return value;
    },
  };
});
vi.mock('../useProjectZoom', async () => {
  const { ref } = await import('vue');
  return {
    useProjectZoom: () => {
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
    };
    state.editorState = value;
    return value;
  },
}));
vi.mock('../../properties/cursor/useCursorReplacer', async () => {
  const { ref } = await import('vue');
  return {
    useCursorReplacer: () => {
      const value = {
        selectedCursor: ref('automatic'),
        cursorSize: ref(24),
        cursorColor: ref('#ffffff'),
        enableShadow: ref(true),
        shadowBlur: ref(8),
        shadowColor: ref('#000000'),
        shadowDirection: ref('bottom-right'),
        clickEffects: ref({ left: {}, right: {} }),
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
    capture.listBackgroundLibrary.mockResolvedValue([{ id: 'background-1' }]);
    capture.onBackgroundLibraryChanged.mockReturnValue(() => undefined);
    state.compositionDurationMs.mockReturnValue(2000);
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
      expect.objectContaining({ fps: 60, width: 1920, height: 1080 }),
    );

    state.cursor.cursorSize.value = 17;
    state.cursor.selectedCursor.value = 'handpointing';
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
          selectedCursor: 'handpointing',
          size: 17,
          motion: {
            preset: 'custom',
            smoothing: 0,
            springMassMultiplier: 0.5,
            motionBlur: 0,
          },
        }),
      }),
    );

    state.compositionState.composition.value = {
      schemaVersion: 1,
      assets: [],
      clips: [
        {
          id: 'clip-1',
          kind: 'screen',
          name: 'Screen',
          assetId: 'asset-1',
          timelineStartMs: 0,
          timelineDurationMs: 1000,
          sourceInMs: 0,
          sourceDurationMs: 1000,
          playbackRate: 1,
          enabled: true,
          order: 0,
          transform: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    };
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
