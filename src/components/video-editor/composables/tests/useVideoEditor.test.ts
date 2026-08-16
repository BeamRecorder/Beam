import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { AudioClip, ClipComposition, MediaAsset, VisualClip } from '~/media/shared/composition-types';

const capture = vi.hoisted(() => ({
  listBackgroundLibrary: vi.fn(),
  onBackgroundLibraryChanged: vi.fn(),
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

const cloneComposition = (value: ClipComposition): ClipComposition =>
  JSON.parse(JSON.stringify(value)) as ClipComposition;

const mediaAsset = (id: string, kind: MediaAsset['kind'], overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'audio' ? 'wav' : kind === 'image' ? 'png' : 'mp4'}`,
  durationMs: 5_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `project-media://project-1/${id}`,
  origin: 'project',
  ...overrides,
});

const videoClip = (id: string, assetId: string, overrides: Partial<VisualClip> = {}): VisualClip => ({
  id,
  kind: 'video',
  name: id,
  assetId,
  timelineStartMs: 1_000,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: -1,
  transform: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  crop: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const audioClip = (id: string, assetId: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId,
  role: 'imported',
  timelineStartMs: 1_000,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 2,
  volume: 100,
  ...overrides,
});

const createCompositionFixture = (): ClipComposition => ({
  schemaVersion: 6,
  keyboardCaptionSessions: [],
  assets: [
    mediaAsset('screen-asset', 'video', { origin: 'session', sessionId: 'session-1' }),
    mediaAsset('video-asset', 'video'),
    mediaAsset('audio-asset', 'audio'),
  ],
  clips: [
    videoClip('screen', 'screen-asset', {
      kind: 'screen',
      name: 'Screen recording',
      timelineStartMs: 0,
      timelineDurationMs: 5_000,
      sourceDurationMs: 5_000,
      order: 0,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance('screen'),
    }),
    videoClip('imported-video', 'video-asset'),
    audioClip('imported-audio', 'audio-asset'),
  ],
});

type CompositionMutation = (composition: ClipComposition) => void;

const visualMutations: Array<[string, CompositionMutation]> = [
  [
    'transform',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.transform = { x: 0.2, y: 0.15, width: 0.4, height: 0.35 };
    },
  ],
  [
    'appearance',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.appearance = { ...clip.appearance, frame: 'safari', shadowSize: 'lg' };
    },
  ],
  [
    'crop',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.crop = { x: 0.1, y: 0.15, width: 0.75, height: 0.7 };
    },
  ],
  [
    'mirror',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.isMirrored = true;
      clip.isMirroredY = true;
    },
  ],
  [
    'order',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.order = -4;
    },
  ],
  [
    'name',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video') as VisualClip;
      clip.name = 'Renamed imported video';
    },
  ],
];

const playbackMutations: Array<[string, CompositionMutation]> = [
  [
    'asset source',
    (composition) => {
      composition.assets.find((asset) => asset.id === 'video-asset')!.src =
        'project-media://project-1/replaced-video.mp4';
    },
  ],
  [
    'timeline start',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.timelineStartMs = 1_250;
    },
  ],
  [
    'source in',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.sourceInMs = 500;
    },
  ],
  [
    'timeline duration',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video')!;
      clip.timelineDurationMs = 2_500;
      clip.sourceDurationMs = 2_500;
    },
  ],
  [
    'playback rate',
    (composition) => {
      const clip = composition.clips.find((entry) => entry.id === 'imported-video')!;
      clip.playbackRate = 1.5;
      clip.timelineDurationMs = 2_000;
    },
  ],
  [
    'enabled',
    (composition) => {
      composition.clips.find((clip) => clip.id === 'imported-video')!.enabled = false;
    },
  ],
  [
    'audio volume',
    (composition) => {
      (composition.clips.find((clip) => clip.id === 'imported-audio') as AudioClip).volume = 55;
    },
  ],
  [
    'add video',
    (composition) => {
      composition.assets.push(mediaAsset('added-video-asset', 'video'));
      composition.clips.push(videoClip('added-video', 'added-video-asset', { timelineStartMs: 0 }));
    },
  ],
  [
    'add audio',
    (composition) => {
      composition.assets.push(mediaAsset('added-audio-asset', 'audio'));
      composition.clips.push(audioClip('added-audio', 'added-audio-asset', { timelineStartMs: 0 }));
    },
  ],
  [
    'remove video',
    (composition) => {
      composition.clips = composition.clips.filter((clip) => clip.id !== 'imported-video');
      composition.assets = composition.assets.filter((asset) => asset.id !== 'video-asset');
    },
  ],
  [
    'remove audio',
    (composition) => {
      composition.clips = composition.clips.filter((clip) => clip.id !== 'imported-audio');
      composition.assets = composition.assets.filter((asset) => asset.id !== 'audio-asset');
    },
  ],
];

describe('useVideoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.initialComposition = undefined;
    state.zoomOptions = undefined;
    capture.listBackgroundLibrary.mockResolvedValue([{ id: 'background-1' }]);
    capture.onBackgroundLibraryChanged.mockReturnValue(() => undefined);
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

  const mountWithComposition = async () => {
    state.initialComposition = createCompositionFixture();
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
