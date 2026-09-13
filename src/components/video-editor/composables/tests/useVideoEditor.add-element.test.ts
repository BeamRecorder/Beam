import { defineComponent, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CaptureProject, ProjectEditorData } from '~/api/types/capture-api';
import type { ShapeLayerFamily } from '~/media/shared/shape-layer-types';
import type { useVideoElements } from '../../elements/useVideoElements';

type ElementEditorOptions = Parameters<typeof useVideoElements>[0];
interface HarnessPlayer {
  isPlaying: Ref<boolean>;
  setPlaying: Mock<(playing: boolean) => Promise<void>>;
}
interface HarnessCompositionState {
  selectedClipId: Ref<string | null>;
  selectedClipIds: Ref<string[]>;
  selectedClip: ComputedRef<{ id: string; locked: boolean } | null>;
  addElement: Mock<(kind: string) => Promise<string>>;
}
interface HarnessZoomState {
  selectedZoomId: Ref<string | null>;
  selectedZoomIds: Ref<string[]>;
}
interface HarnessElements {
  add: Mock<(family: ShapeLayerFamily) => void>;
}

const harness = vi.hoisted(() => ({
  events: [] as string[],
  capture: {
    listBackgroundLibrary: vi.fn().mockResolvedValue([]),
    onBackgroundLibraryChanged: vi.fn().mockReturnValue(() => undefined),
    listCursorPacks: vi.fn().mockResolvedValue([]),
    onCursorPacksChanged: vi.fn().mockReturnValue(() => undefined),
  },
  toast: { error: vi.fn() },
  player: null as HarnessPlayer | null,
  compositionState: null as HarnessCompositionState | null,
  zoomState: null as HarnessZoomState | null,
  elementOptions: null as ElementEditorOptions | null,
  elements: null as HarnessElements | null,
}));

vi.mock('../../../../api/capture', () => ({ capture: harness.capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => harness.toast }));
vi.mock('../useEditorPresets', () => ({
  useEditorPresets: () => ({ load: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../useVideoPlayer', async () => {
  const { ref } = await import('vue');
  return {
    useVideoPlayer: () => {
      const isPlaying = ref(false);
      const player = {
        currentTime: ref(2.5),
        isPlaying,
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
        setPlaying: vi.fn(async (playing: boolean) => {
          harness.events.push(playing ? 'play' : 'pause');
          isPlaying.value = playing;
        }),
        seek: vi.fn().mockResolvedValue(undefined),
      };
      harness.player = player;
      return player;
    },
  };
});
vi.mock('../useClipComposition', async () => {
  const { computed, ref } = await import('vue');
  return {
    useClipComposition: () => {
      const composition = ref({ schemaVersion: 6, assets: [], clips: [], keyboardCaptionSessions: [] });
      const selectedClipId = ref<string | null>('locked-clip');
      const selectedClipIds = ref<string[]>(['locked-clip']);
      const selectedClip = computed(() => (selectedClipId.value ? { id: selectedClipId.value, locked: true } : null));
      const addElement = vi.fn(async (kind: string) => {
        harness.events.push('delegate:' + kind);
        return 'added-clip';
      });
      const selectClips = vi.fn((ids: string[]) => {
        harness.events.push('clear-clips');
        selectedClipIds.value = [...ids];
        selectedClipId.value = ids[0] ?? null;
      });
      const value = {
        composition,
        selectedClipId,
        selectedClipIds,
        selectedClip,
        selectClip: vi.fn(),
        selectClips,
        synchronizeRecording: vi.fn(),
        restoreComposition: vi.fn(),
        addElement,
      };
      harness.compositionState = value;
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
        selectedZoomId: ref<string | null>('zoom-1'),
        selectedZoomIds: ref<string[]>(['zoom-1']),
        ensureAutomaticZooms: vi.fn(),
      };
      harness.zoomState = value;
      return value;
    },
  };
});
vi.mock('../useProjectEditorState', () => ({
  useProjectEditorState: () => ({
    load: vi.fn().mockResolvedValue(undefined),
    scheduleSave: vi.fn(),
    enableDefaultCapture: vi.fn(),
  }),
}));
vi.mock('../../elements/useVideoElements', () => ({
  useVideoElements: (options: ElementEditorOptions) => {
    harness.elementOptions = options;
    const editor = {
      add: vi.fn((family: ShapeLayerFamily) => {
        harness.events.push('add:' + family);
      }),
    };
    harness.elements = editor;
    return editor;
  },
}));
vi.mock('../../properties/cursor/useCursorReplacer', async () => {
  const { computed, ref } = await import('vue');
  return {
    useCursorReplacer: () => ({
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
    }),
  };
});
vi.mock('../../../export/composition/snapshot', () => ({
  createCompositionSnapshot: () => ({ snapshot: true }),
}));

import { useVideoEditor } from '../useVideoEditor';

const wrappers: Array<{ unmount: () => void }> = [];
const project: CaptureProject = {
  id: 'project-1',
  name: 'Demo',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sessionCount: 0,
  previewSrc: null,
};
const mountEditor = async () => {
  let api!: ReturnType<typeof useVideoEditor>;
  const Harness = defineComponent({
    setup: () => {
      api = useVideoEditor({
        project: ref<CaptureProject | null>(project),
        editorData: ref<ProjectEditorData | null>(null),
      });
      return {};
    },
    template: '<div />',
  });
  const wrapper = mount(Harness);
  wrappers.push(wrapper);
  await flushPromises();
  return { api, wrapper };
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.events.length = 0;
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useVideoEditor timeline element insertion', () => {
  it.each(['shape', 'arrow', 'text', 'drawing'] as const)(
    'routes %s through the shared element editor',
    async (family) => {
      const { api } = await mountEditor();

      await api.compositionState.addElement(family);

      expect(harness.elements!.add).toHaveBeenCalledWith(family);
      expect(harness.compositionState!.addElement).not.toHaveBeenCalled();
      expect(api.activeTab.value).toBe('elements');
    },
  );

  it('pauses first and clears clip and zoom selection before starting an element', async () => {
    const { api } = await mountEditor();
    harness.player!.isPlaying.value = true;

    await api.compositionState.addElement('text');

    expect(harness.events).toEqual(['pause', 'clear-clips', 'add:text']);
    expect(harness.player!.isPlaying.value).toBe(false);
    expect(harness.compositionState!.selectedClipId.value).toBeNull();
    expect(harness.compositionState!.selectedClipIds.value).toEqual([]);
    expect(harness.zoomState!.selectedZoomId.value).toBeNull();
    expect(harness.zoomState!.selectedZoomIds.value).toEqual([]);
    expect(api.activeTab.value).toBe('elements');
  });

  it('keeps captions and media on the existing composition insertion path', async () => {
    const { api } = await mountEditor();

    for (const kind of ['caption', 'video', 'image', 'sound'] as const) {
      await api.compositionState.addElement(kind);
    }

    expect(harness.compositionState!.addElement.mock.calls).toEqual([['caption'], ['video'], ['image'], ['sound']]);
    expect(harness.elements!.add).not.toHaveBeenCalled();
  });

  it('keeps color and effect helpers on the existing insertion path and clears both zoom refs', async () => {
    await mountEditor();

    await harness.elementOptions!.addColor?.();
    await harness.elementOptions!.addBlur?.();
    await harness.elementOptions!.addHighlight?.();
    await harness.elementOptions!.addImage?.();
    harness.elementOptions!.clearZoom();

    expect(harness.compositionState!.addElement.mock.calls).toEqual([['color'], ['blur'], ['highlight'], ['image']]);
    expect(harness.zoomState!.selectedZoomId.value).toBeNull();
    expect(harness.zoomState!.selectedZoomIds.value).toEqual([]);
  });
});
