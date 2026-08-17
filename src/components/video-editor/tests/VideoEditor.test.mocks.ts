import { vi } from 'vitest';
import type { ClipComposition } from '~/media/shared/composition-types';
import { COMPOSITION_SCHEMA_VERSION } from '~/media/shared/composition-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';

const { editorState } = vi.hoisted(() => ({ editorState: { store: undefined as any } }));
const capture = vi.hoisted(() => ({}));
const exportState = vi.hoisted(() => ({ isExporting: undefined as any, progress: undefined as any }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
const historyState = vi.hoisted(() => ({
  recordSnapshot: vi.fn(),
  commitNow: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
}));

vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => toast }));

vi.mock('../composables/useVideoEditor', async () => {
  const { computed, ref } = await import('vue');
  return {
    useVideoEditor: vi.fn(() => {
      const activeTab = ref('canvas');
      const composition = ref<ClipComposition>({
        schemaVersion: COMPOSITION_SCHEMA_VERSION,
        keyboardCaptionSessions: [],
        assets: [
          {
            id: 'screen-asset',
            kind: 'video',
            name: 'Screen',
            fileName: 'screen.mp4',
            durationMs: 2_000,
            width: 1_280,
            height: 720,
            src: 'screen.mp4',
            origin: 'session',
          },
          {
            id: 'audio',
            kind: 'audio',
            name: 'Audio',
            fileName: 'audio.wav',
            durationMs: 2_000,
            width: null,
            height: null,
            src: 'audio.wav',
            origin: 'project',
          },
        ],
        clips: [
          {
            id: 'screen',
            kind: 'screen',
            name: 'Screen',
            assetId: 'screen-asset',
            timelineStartMs: 0,
            timelineDurationMs: 2_000,
            sourceInMs: 0,
            sourceDurationMs: 2_000,
            playbackRate: 1,
            transitions: { entry: null, exit: null },
            enabled: true,
            order: 0,
            trackId: 'screen-track',
            transform: { x: 0, y: 0, width: 1, height: 1 },
            appearance: createDefaultClipAppearance('screen'),
            isMirrored: false,
            isMirroredY: false,
          },
          {
            id: 'audio',
            kind: 'audio',
            name: 'Audio',
            assetId: 'audio',
            role: 'system',
            timelineStartMs: 0,
            timelineDurationMs: 2_000,
            sourceInMs: 0,
            sourceDurationMs: 2_000,
            playbackRate: 1,
            transitions: { entry: null, exit: null },
            enabled: true,
            order: 1,
            volume: 100,
          },
        ],
      } as ClipComposition);
      const selectedClipId = ref<string | null>(null);
      const selectedClip = computed(
        () => composition.value.clips.find((clip) => clip.id === selectedClipId.value) ?? null,
      );
      const player = {
        isPlaying: ref(false),
        currentTime: ref(0),
        duration: ref(2),
        volume: ref(100),
        playbackState: ref('idle'),
        playbackError: ref(null),
        frameVersion: ref(0),
        selectedBackground: ref(null),
        selectedBackgroundMedia: ref(null),
        backgroundBlurPercent: ref(0),
        backgroundGroups: ref([]),
        addBackground: vi.fn(),
        setPlaying: vi.fn().mockResolvedValue(undefined),
        seek: vi.fn().mockResolvedValue(undefined),
        loadComposition: vi.fn().mockResolvedValue(undefined),
        frameFor: vi.fn().mockReturnValue(null),
      };
      const cursor = {
        selectedCursor: ref('automatic'),
        cursorSize: ref(24),
        cursorColor: ref('#fff'),
        enableShadow: ref(true),
        shadowBlur: ref(4),
        shadowColor: ref('#000'),
        shadowDirection: ref('bottom'),
        clickEffects: ref({}),
      };
      const cursorMotion = ref({ preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 });
      const compositionState = {
        composition,
        selectedClipId,
        selectedClip,
        selectedClipInfo: computed(() =>
          selectedClip.value ? { id: selectedClip.value.id, kind: selectedClip.value.kind } : null,
        ),
        selectedCaptionClip: computed(() => null),
        isVideoEnabled: ref(true),
        isWebcamEnabled: ref(true),
        isSystemAudioEnabled: ref(true),
        isMicAudioEnabled: ref(true),
        selectClip: vi.fn((id: string) => {
          selectedClipId.value = id;
        }),
        addElement: vi.fn().mockResolvedValue(undefined),
        addCaptionAtTime: vi.fn(),
        updateCaption: vi.fn(),
        trimClipEdge: vi.fn(),
        moveClipTo: vi.fn(),
        splitSelectedClip: vi.fn(),
        deleteSelectedClip: vi.fn(),
        reorderVisualClip: vi.fn(),
        updateSelectedAppearance: vi.fn(),
        updateSelectedTransform: vi.fn(),
        previewSelectedTransform: vi.fn(),
        updateSelectedCrop: vi.fn(),
        updateSelectedCameraLayout: vi.fn(),
        updateSelectedCameraFraming: vi.fn(),
        updateSelectedMirrored: vi.fn(),
        updateSelectedMirroredY: vi.fn(),
        updateSelectedRate: vi.fn(),
        updateSelectedVolume: vi.fn(),
        updateSelectedEnabled: vi.fn(),
        toggleClip: vi.fn(),
        detachSelectedClip: vi.fn(),
      };
      const zoomState = {
        zoomElements: ref([]),
        selectedZoomId: ref<string | null>(null),
        selectedZoom: ref(null),
        canGenerateZooms: ref(true),
        hasAutomaticZooms: ref(false),
        addZoomAtTime: vi.fn(),
        generateZooms: vi.fn(),
        updateZoom: vi.fn(),
        trimZoomEdge: vi.fn(),
        moveZoom: vi.fn(),
        previewZoom: vi.fn(),
        deleteSelectedZoom: vi.fn(),
      };
      const outputCanvas = ref({ preset: '16:9', width: 1920, height: 1080, showBackground: false });
      const store = {
        activeTab,
        systemVolume: ref(100),
        micVolume: ref(100),
        sourceSize: ref({ width: 1280, height: 720 }),
        player,
        cursor,
        cursorMotion,
        compositionState,
        editorState: {
          loading: ref(false),
          isSaving: ref(false),
          scheduleSave: vi.fn(),
          saveNow: vi.fn().mockResolvedValue(undefined),
        },
        zoomState,
        exportRequest: computed(() => ({ projectName: 'Demo', snapshot: {}, format: 'webm', preset: 'medium' })),
        outputCanvas,
        handleSelectTab: vi.fn((tab: string) => {
          activeTab.value = tab;
        }),
      };
      editorState.store = store;
      return store;
    }),
  };
});

vi.mock('../composables/useEditorUndoRedo', async () => {
  const { ref } = await import('vue');
  return {
    useEditorUndoRedo: vi.fn(() => ({
      ...historyState,
      canUndo: ref(false),
      canRedo: ref(false),
      lastAction: ref(null),
    })),
  };
});

vi.mock('../../export/useExportJob', async () => {
  const { ref } = await import('vue');
  return {
    useExportJob: vi.fn(() => {
      exportState.isExporting = ref(false);
      exportState.progress = ref(null);
      return { isExporting: exportState.isExporting, progress: exportState.progress, start: vi.fn() };
    }),
  };
});

vi.mock('../EditorAmbientBackground.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockEditorAmbientBackground',
      props: { background: { default: null } },
      setup(props) {
        return () => {
          const background = props.background as { kind?: string; id?: string; path?: string } | null;
          return h('div', {
            class: 'mock-editor-ambient',
            'data-background-kind': background?.kind ?? 'none',
            'data-background-id': background?.id ?? '',
            'data-background-path': background?.path ?? '',
          });
        };
      },
    }),
  };
});

vi.mock('../Topbar.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockTopbar',
      emits: ['back-to-hud', 'open-project', 'undo', 'redo'],
      setup(_, { emit }) {
        return () =>
          h('div', { class: 'mock-topbar' }, [
            h('button', { class: 'back', onClick: () => emit('back-to-hud') }),
            h('button', { class: 'open', onClick: () => emit('open-project', { id: 'project-1' }) }),
            h('button', { class: 'undo', onClick: () => emit('undo') }),
            h('button', { class: 'redo', onClick: () => emit('redo') }),
          ]);
      },
    }),
  };
});

vi.mock('../sidebar/SidebarPanel.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockSidebar',
      emits: ['select-tab'],
      setup(_, { emit }) {
        return () => h('button', { class: 'sidebar-tab', onClick: () => emit('select-tab', 'zoom') });
      },
    }),
  };
});

vi.mock('../properties/PropertiesPanel.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockProperties',
      props: { composition: { type: Object, default: null } },
      emits: [
        'update:system-volume',
        'update:mic-volume',
        'import:background',
        'update:selected-background',
        'update:canvas',
        'update:zoom',
        'delete:zoom',
        'generate:zooms',
        'update:caption',
        'update:composition',
        'preview:composition',
        'select-caption',
        'delete-clip',
        'split-clip',
        'update:clip-rate',
        'update:clip-volume',
        'update:clip-enabled',
        'unlink-clip',
        'update:clip-is-mirrored',
        'update:clip-appearance',
        'update:clip-transform',
        'reset:clip-transform',
      ],
      setup(props, { emit }) {
        const compositionWithTransform = (x: number) => {
          const composition = props.composition as ClipComposition;
          return {
            ...composition,
            clips: composition.clips.map((clip) =>
              clip.kind === 'screen' ? { ...clip, transform: { ...clip.transform, x } } : clip,
            ),
          };
        };
        return () =>
          h('div', { class: 'mock-properties' }, [
            h('button', { class: 'system-volume', onClick: () => emit('update:system-volume', 150) }),
            h('button', { class: 'mic-volume', onClick: () => emit('update:mic-volume', 125) }),
            h('button', {
              class: 'import-background',
              onClick: () => emit('import:background', { kind: 'color', color: '#f00' }),
            }),
            h('button', {
              class: 'update-canvas',
              onClick: () => emit('update:canvas', { preset: '1:1', width: 1080, height: 1080, showBackground: true }),
            }),
            h('button', {
              class: 'preview-composition',
              onClick: () => emit('preview:composition', compositionWithTransform(0.25)),
            }),
            h('button', {
              class: 'update-composition',
              onClick: () => emit('update:composition', compositionWithTransform(0.5)),
            }),
            h('button', { class: 'delete-zoom', onClick: () => emit('delete:zoom') }),
            h('button', { class: 'generate-zooms', onClick: () => emit('generate:zooms') }),
            h('button', { class: 'delete-clip', onClick: () => emit('delete-clip') }),
            h('button', { class: 'update-rate', onClick: () => emit('update:clip-rate', 1.5) }),
            h('button', { class: 'update-volume', onClick: () => emit('update:clip-volume', 80) }),
            h('button', { class: 'update-enabled', onClick: () => emit('update:clip-enabled', false) }),
            h('button', { class: 'unlink', onClick: () => emit('unlink-clip') }),
            h('button', { class: 'mirrored', onClick: () => emit('update:clip-is-mirrored', true) }),
            h('button', {
              class: 'appearance',
              onClick: () => emit('update:clip-appearance', { borderEnabled: true }),
            }),
            h('button', { class: 'reset-transform', onClick: () => emit('reset:clip-transform') }),
          ]);
      },
    }),
  };
});

vi.mock('../canvas/EditorCanvas.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockEditorCanvas',
      props: {
        isGridVisible: { type: Boolean, default: false },
        composition: { type: Object, default: null },
      },
      emits: [
        'update:zoom',
        'preview:zoom',
        'select:clip',
        'select:canvas',
        'deselect:transform-clip',
        'update:clip-transform',
        'preview:clip-transform',
        'update:clip-crop',
        'done:crop',
        'deselect:zoom',
        'update:is-playing',
        'update:current-time',
      ],
      setup(props, { emit, expose }) {
        expose({
          viewportZoom: {
            zoomPercent: { value: 100 },
            isZoomedOrPanned: { value: false },
            zoomIn: vi.fn(),
            zoomOut: vi.fn(),
            resetZoom: vi.fn(),
          },
        });
        return () => {
          const previewComposition = props.composition as ClipComposition | null;
          const previewClip = previewComposition?.clips.find((clip) => clip.id === 'screen');
          const previewTransformX = previewClip?.kind === 'screen' ? previewClip.transform.x : undefined;
          return h(
            'div',
            {
              class: 'mock-canvas',
              'data-composition-transform-x': String(previewTransformX ?? ''),
            },
            [
              props.isGridVisible ? h('div', { class: 'canvas-3x3-grid' }) : null,
              h('button', { class: 'select-audio', onClick: () => emit('select:clip', 'audio') }),
              h('button', { class: 'select-canvas', onClick: () => emit('select:canvas') }),
              h('button', {
                class: 'update-zoom',
                onClick: () =>
                  emit('update:zoom', {
                    id: 'z',
                    sessionId: 's',
                    startMs: 0,
                    endMs: 1000,
                    focus: { cx: 0.5, cy: 0.5 },
                    depth: 2,
                    mode: 'manual',
                  }),
              }),
              h('button', { class: 'preview-zoom', onClick: () => emit('preview:zoom', { id: 'z' }) }),
              h('button', {
                class: 'transform',
                onClick: () => emit('update:clip-transform', { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }),
              }),
              h('button', {
                class: 'crop',
                onClick: () => emit('update:clip-crop', { x: 0, y: 0, width: 1, height: 1 }),
              }),
              h('button', { class: 'done-crop', onClick: () => emit('done:crop') }),
              h('button', { class: 'pause', onClick: () => emit('update:is-playing', false) }),
            ],
          );
        };
      },
    }),
  };
});

vi.mock('../canvas/CanvasToolbar.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockCanvasToolbar',
      emits: ['select:preset', 'toggle:crop', 'toggle:grid'],
      setup(_, { emit }) {
        return () =>
          h('div', [
            h('button', { class: 'preset', onClick: () => emit('select:preset', '1:1') }),
            h('button', { class: 'toggle-crop', onClick: () => emit('toggle:crop') }),
            h('button', { class: 'toggle-grid', onClick: () => emit('toggle:grid') }),
          ]);
      },
    }),
  };
});

vi.mock('../timeline/TimelineToolbar.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockTimelineToolbar',
      emits: ['update:is-playing', 'update:current-time', 'add:element'],
      setup(_, { emit }) {
        return () =>
          h('div', [
            h('button', { class: 'add-sound', onClick: () => emit('add:element', 'sound') }),
            h('button', { class: 'timeline-play', onClick: () => emit('update:is-playing', true) }),
            h('button', { class: 'timeline-time', onClick: () => emit('update:current-time', 1.25) }),
          ]);
      },
    }),
  };
});

vi.mock('../timeline/EditorTimeline.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      name: 'MockEditorTimeline',
      emits: [
        'select:zoom',
        'select:clip',
        'toggle:clip',
        'trim:clip',
        'move:clip',
        'trim:zoom',
        'move:zoom',
        'add:zoom',
        'add:caption',
        'delete:clips',
        'reorder:clip',
      ],
      setup(_, { emit }) {
        return () =>
          h('div', [
            h('button', { class: 'timeline-select-zoom', onClick: () => emit('select:zoom', 'z') }),
            h('button', { class: 'timeline-select-clip', onClick: () => emit('select:clip', 'audio') }),
            h('button', { class: 'timeline-toggle', onClick: () => emit('toggle:clip', 'audio') }),
            h('button', { class: 'timeline-add-caption', onClick: () => emit('add:caption', 500) }),
            h('button', { class: 'timeline-delete-clips', onClick: () => emit('delete:clips', ['audio']) }),
          ]);
      },
    }),
  };
});

export { editorState, capture, exportState, toast, historyState };
