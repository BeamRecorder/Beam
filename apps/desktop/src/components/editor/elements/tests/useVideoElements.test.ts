import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref, shallowRef } from 'vue';
import type {
  AudioClip,
  BlurClip,
  CaptionClip,
  Clip,
  ClipComposition,
  ColorClip,
  MediaAsset,
  ShapeClip,
  VisualClip,
} from '@beam/engine/shared/composition-types';
import { createElementText } from '@beam/engine/shared/element-text';
import type { DrawnElement } from '@beam/engine/shared/element-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import { DEFAULT_COLOR_FILL } from '@beam/engine/shared/color-fill-types';
import { normalizeColorLayerStyle } from '@beam/engine/shared/color-layer-style';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { createComposition } from '@beam/engine/commands/clip-engine';
import type { ElementEditorContext } from '../element-editor-types';
import { useVideoElements } from '../useVideoElements';
import { useMixedTimelineSelection } from '../../composables/useMixedTimelineSelection';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => `translated:${key}` }),
}));

const makeShapeClip = (id: string, order: number, overrides: Partial<ShapeClip> = {}): ShapeClip => ({
  id,
  trackId: id,
  kind: 'shape',
  assetId: '',
  name: id,
  enabled: true,
  order,
  timelineStartMs: 0,
  timelineDurationMs: 10_000,
  sourceInMs: 0,
  sourceDurationMs: 10_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  ...normalizeShapeLayerStyle({ family: 'shape' }),
  transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
  ...overrides,
});

const makeComposition = () =>
  createComposition([], [makeShapeClip('background-element', 0), makeShapeClip('existing-element', 1)]);

const makeClipBase = (id: string) => ({
  id,
  trackId: id,
  name: id,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
});

const makeImageClip = (id: string): VisualClip => ({
  ...makeClipBase(id),
  kind: 'image',
  assetId: 'image-asset',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const makeColorClip = (id: string): ColorClip => ({
  ...makeClipBase(id),
  kind: 'color',
  assetId: '',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  fill: DEFAULT_COLOR_FILL,
  ...normalizeColorLayerStyle(undefined),
});

const makeBlurClip = (id: string): BlurClip => ({
  ...makeClipBase(id),
  kind: 'blur',
  assetId: '',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  tintOpacity: 0,
  color: '#000000',
});

const makeCaptionClip = (id: string, options: { customText?: string; isAiGenerated?: boolean } = {}): CaptionClip => ({
  ...makeClipBase(id),
  kind: 'caption',
  caption: {
    type: 'text',
    sentences: [],
    style: {
      ...createDefaultCaptionStyle(),
      ...(options.customText === undefined ? {} : { customText: options.customText }),
    },
  },
  ...(options.isAiGenerated === undefined ? {} : { isAiGenerated: options.isAiGenerated }),
});

const makeKeyboardCaptionClip = (id: string): CaptionClip => ({
  ...makeClipBase(id),
  kind: 'caption',
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
    followCursor: false,
    recordedPlatform: 'macos',
    sourceSessionId: 'session',
    style: { ...createDefaultCaptionStyle(), customText: '' },
  },
});

const makeVideoClip = (id: string): VisualClip => ({
  ...makeClipBase(id),
  kind: 'video',
  assetId: 'video-asset',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('video'),
  isMirrored: false,
  isMirroredY: false,
});

const makeAudioClip = (id: string): AudioClip => ({
  ...makeClipBase(id),
  kind: 'audio',
  assetId: 'audio-asset',
  role: 'system',
  volume: 100,
});

const makeAsset = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: null,
  durationMs: 1_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `project-media:${id}`,
  origin: 'project',
});

const makeCompositionWith = (clip: Clip): ClipComposition => {
  const asset =
    clip.kind === 'image'
      ? makeAsset('image-asset', 'image')
      : clip.kind === 'video'
        ? makeAsset('video-asset', 'video')
        : clip.kind === 'audio'
          ? makeAsset('audio-asset', 'audio')
          : null;
  return createComposition(asset ? [asset] : [], [clip]);
};

interface HarnessOptions {
  composition?: ClipComposition;
  selectedId?: string | null;
  activeTab?: string;
  currentTime?: number;
  isPlaying?: boolean;
}

const wrappers: VueWrapper[] = [];

const mountVideoElements = (configuration: HarnessOptions = {}) => {
  const composition = shallowRef(configuration.composition ?? makeComposition());
  const selectedId = ref<string | null>(configuration.selectedId ?? null);
  const activeTab = ref(configuration.activeTab ?? 'timeline');
  const currentTime = ref(configuration.currentTime ?? 1.2346);
  const isPlaying = ref(configuration.isPlaying ?? false);
  const select = vi.fn((id: string) => {
    selectedId.value = id;
    activeTab.value = 'clip';
  });
  const clearZoom = vi.fn();
  let editor!: ElementEditorContext;
  const Host = defineComponent({
    setup() {
      editor = useVideoElements({
        composition,
        selectedId,
        activeTab,
        currentTime,
        isPlaying,
        select,
        clearZoom,
      });
      return () => null;
    },
  });
  const wrapper = mount(Host);
  wrappers.push(wrapper);

  return {
    editor,
    composition,
    selectedId,
    activeTab,
    currentTime,
    isPlaying,
    select,
    clearZoom,
  };
};

beforeEach(() => {
  let nextId = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `added-element-${++nextId}` });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe('useVideoElements', () => {
  it.each([
    ['shape', makeShapeClip('selected-shape', 0)],
    ['image', makeImageClip('selected-image')],
    ['color', makeColorClip('selected-color')],
    ['blur', makeBlurClip('selected-blur')],
    ['manual text caption', makeCaptionClip('manual-caption', { customText: '' })],
  ] satisfies Array<[string, Clip]>)('routes a selected %s from inside Clip', (_name, clip) => {
    const state = mountVideoElements({
      composition: makeCompositionWith(clip),
      selectedId: clip.id,
      activeTab: 'clip',
    });

    expect(state.activeTab.value).toBe('clip');
  });

  it('routes a newly selected shape to Clip after the selection handler settles', async () => {
    const shape = makeShapeClip('selected-shape', 0);
    const state = mountVideoElements({
      composition: makeCompositionWith(shape),
      activeTab: 'clip',
    });

    state.select(shape.id);
    await nextTick();

    expect(state.activeTab.value).toBe('clip');
  });

  it('keeps drawing active when choosing Clip again', async () => {
    const shape = makeShapeClip('selected-shape', 0);
    const state = mountVideoElements({
      composition: makeCompositionWith(shape),
      selectedId: shape.id,
      activeTab: 'clip',
    });
    state.editor.add('drawing');
    expect(state.editor.drawingMode.value).toBe(true);

    state.activeTab.value = 'clip';
    await nextTick();

    expect(state.activeTab.value).toBe('clip');
    expect(state.selectedId.value).toBe(shape.id);
    expect(state.editor.drawingMode.value).toBe(true);
  });

  it.each([
    ['video', makeVideoClip('selected-video')],
    ['audio', makeAudioClip('selected-audio')],
    ['generated text caption', makeCaptionClip('generated-caption', { isAiGenerated: true })],
    ['keyboard caption with custom text', makeKeyboardCaptionClip('keyboard-caption')],
  ] satisfies Array<[string, Clip]>)('keeps the Clip tab for a selected %s', (_name, clip) => {
    const state = mountVideoElements({
      composition: makeCompositionWith(clip),
      activeTab: 'clip',
    });

    state.selectedId.value = clip.id;

    expect(state.activeTab.value).toBe('clip');
  });

  it('routes a generated caption to Clip when the same clip becomes manual text', async () => {
    const generated = makeCaptionClip('selected-caption', {
      isAiGenerated: true,
    });
    const state = mountVideoElements({
      composition: makeCompositionWith(generated),
      selectedId: generated.id,
      activeTab: 'clip',
    });

    expect(state.activeTab.value).toBe('clip');

    state.composition.value = makeCompositionWith(makeCaptionClip(generated.id, { customText: 'Edited caption' }));
    await nextTick();

    expect(state.selectedId.value).toBe(generated.id);
    expect(state.activeTab.value).toBe('clip');
  });

  it.each([
    ['shape', makeShapeClip('selected-shape', 0)],
    ['image', makeImageClip('selected-image')],
    ['color', makeColorClip('selected-color')],
    ['blur', makeBlurClip('selected-blur')],
    ['manual text', makeCaptionClip('manual-caption', { customText: 'Text' })],
  ] satisfies Array<[string, Clip]>)('preserves manual sidebar navigation with a selected %s', async (_name, clip) => {
    const state = mountVideoElements({
      composition: makeCompositionWith(clip),
      selectedId: clip.id,
      activeTab: 'clip',
    });
    for (const tab of ['clip', 'canvas', 'zoom', 'clip', 'settings', 'clip']) {
      state.activeTab.value = tab;
      await nextTick();
      expect(state.activeTab.value).toBe(tab);
      expect(state.selectedId.value).toBe(clip.id);
    }
    state.composition.value = {
      ...state.composition.value,
      clips: [{ ...clip, name: 'Renamed selection' }],
    };
    await nextTick();
    expect(state.activeTab.value).toBe('clip');
  });

  it('opens Clip for a different shape after choosing Clip manually', async () => {
    const first = makeShapeClip('first-shape', 0);
    const second = makeShapeClip('second-shape', 1);
    const composition = makeCompositionWith(first);
    composition.clips.push(second);
    const state = mountVideoElements({
      composition,
      selectedId: first.id,
      activeTab: 'clip',
    });
    state.activeTab.value = 'clip';
    await nextTick();
    state.select(second.id);
    await nextTick();
    expect(state.activeTab.value).toBe('clip');
    expect(state.selectedId.value).toBe(second.id);
  });

  it('keeps sidebar choices free with both a shape and zoom selected through the timeline', async () => {
    const shape = makeShapeClip('timeline-shape', 0);
    const state = mountVideoElements({
      composition: makeCompositionWith(shape),
      activeTab: 'canvas',
    });
    const selectedClipIds = ref<string[]>([]);
    const selectedZoomId = ref<string | null>(null);
    const selectedZoomIds = ref<string[]>([]);
    const timeline = useMixedTimelineSelection({
      composition: state.composition,
      zoomElements: ref([
        {
          id: 'zoom',
          sessionId: 'session',
          startMs: 0,
          endMs: 1000,
          focus: { cx: 0.5, cy: 0.5 },
          depth: 2,
          mode: 'manual',
        },
      ]),
      selectedClipId: state.selectedId,
      selectedClipIds,
      selectedZoomId,
      selectedZoomIds,
      activeTab: state.activeTab,
      openPropertiesPanel: vi.fn(),
    });
    timeline.selectItem({ id: shape.id, kind: 'clip', intent: 'replace' });
    await nextTick();
    expect(state.activeTab.value).toBe('clip');
    timeline.selectItem({ id: 'zoom', kind: 'zoom', intent: 'toggle' });
    await nextTick();
    expect(state.activeTab.value).toBe('zoom');
    state.activeTab.value = 'clip';
    await nextTick();
    expect(state.activeTab.value).toBe('clip');
    expect(selectedClipIds.value).toEqual([shape.id]);
    expect(selectedZoomIds.value).toEqual(['zoom']);
  });

  it('preserves another properties tab when an element is selected', () => {
    const shape = makeShapeClip('selected-shape', 0);
    const state = mountVideoElements({
      composition: makeCompositionWith(shape),
      activeTab: 'canvas',
    });

    state.selectedId.value = shape.id;

    expect(state.activeTab.value).toBe('canvas');
  });

  it('inserts new text through addClip at the playhead and places it in the foreground', () => {
    const state = mountVideoElements();

    state.editor.add('text');

    const inserted = state.composition.value.clips.find((clip) => clip.id === state.selectedId.value);
    expect(inserted).toMatchObject({
      id: 'added-element-1',
      trackId: 'added-element-1',
      kind: 'shape',
      family: 'text',
      preset: 'text',
      name: 'translated:text',
      timelineStartMs: 1_235,
      timelineDurationMs: 3_000,
      sourceInMs: 0,
      sourceDurationMs: 3_000,
      playbackRate: 1,
      text: { content: 'translated:newText' },
    });
    expect(state.editor.layers.value).toHaveLength(3);
    const otherOrders = state.composition.value.clips
      .filter((clip) => clip.id !== inserted!.id)
      .map((clip) => clip.order);
    expect(otherOrders.every((order) => inserted!.order < order)).toBe(true);
    expect(state.editor.selected.value?.id).toBe(inserted!.id);
    expect(state.activeTab.value).toBe('clip');
    expect(state.clearZoom).toHaveBeenCalled();
    expect(state.clearZoom.mock.invocationCallOrder[0]).toBeLessThan(state.select.mock.invocationCallOrder[0]!);
  });

  it('inserts a validated drawing as a real shape clip with current timing and drawing color', () => {
    const state = mountVideoElements({ currentTime: 4.5 });
    state.editor.drawingSettings.value.color = '#13579b';
    state.editor.add('drawing');
    expect(state.editor.drawingMode.value).toBe(true);

    const drawn: DrawnElement = {
      transform: { x: 0.2, y: 0.25, width: 0.4, height: 0.3 },
      drawing: {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
        smoothing: 45,
        strokeWidth: 12,
      },
    };
    state.editor.addDrawing(drawn);

    const inserted = state.composition.value.clips.find((clip) => clip.id === state.selectedId.value);
    expect(inserted).toMatchObject({
      id: 'added-element-1',
      trackId: 'added-element-1',
      kind: 'shape',
      family: 'drawing',
      preset: 'freehand',
      fillColor: '#13579b',
      timelineStartMs: 4_500,
      timelineDurationMs: 3_000,
      sourceDurationMs: 3_000,
      transform: drawn.transform,
      drawing: drawn.drawing,
    });
    expect(state.editor.layers.value).toHaveLength(3);
    expect(state.editor.selected.value?.id).toBe(inserted!.id);
    expect(
      state.composition.value.clips
        .filter((clip) => clip.id !== inserted!.id)
        .every((clip) => inserted!.order < clip.order),
    ).toBe(true);
  });

  it('persists selected-layer edits through the composition normalizer', () => {
    const composition = createComposition([], [makeShapeClip('selected-element', 0)]);
    const state = mountVideoElements({
      composition,
      selectedId: 'selected-element',
    });
    const selectedBefore = state.editor.selected.value!;

    state.editor.update({
      borderWidth: 120,
      fillColor: 'not-a-hex-color',
      opacity: 140,
      text: createElementText('Saved element text'),
    });

    const persisted = state.composition.value.clips.find((clip) => clip.id === selectedBefore.id);
    expect(persisted).toMatchObject({
      borderWidth: 40,
      fillColor: '#ff5a1f',
      opacity: 100,
      text: { content: 'Saved element text' },
    });
    expect(state.editor.selected.value).toEqual(persisted);
    expect(persisted).not.toBe(selectedBefore);
  });

  it('deletes the selected layer from the composition through deleteClip', () => {
    const composition = createComposition([], [makeShapeClip('selected-element', 0)]);
    const state = mountVideoElements({
      composition,
      selectedId: 'selected-element',
    });

    state.editor.remove();

    expect(state.composition.value.clips).toEqual([]);
    expect(state.editor.layers.value).toEqual([]);
    expect(state.editor.selected.value).toBeNull();
  });

  it('closes drawing mode when leaving the Clip tab or starting playback', async () => {
    const state = mountVideoElements();
    state.editor.add('drawing');
    expect(state.editor.drawingMode.value).toBe(true);

    state.activeTab.value = 'captions';
    await nextTick();
    expect(state.editor.drawingMode.value).toBe(false);

    state.activeTab.value = 'clip';
    await nextTick();
    state.editor.add('drawing');
    expect(state.editor.drawingMode.value).toBe(true);

    state.isPlaying.value = true;
    await nextTick();
    expect(state.editor.drawingMode.value).toBe(false);
  });
});
