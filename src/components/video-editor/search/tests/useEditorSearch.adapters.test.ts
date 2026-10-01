import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideVideoEditorSearch } from '../useVideoEditorSearch';
import { provideScreenshotEditorSearch } from '../useScreenshotEditorSearch';
import { emptyComposition, type Clip } from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import { insertScreenshotLayer } from '../../screenshot/screenshot-layers';
import { screenshotState } from '../../screenshot/screenshot-state';
import { documentFixture } from '../../screenshot/tests/screenshot-editor-test-helpers';
import type {
  EditorSearchContext,
  VideoEditorSearchOptions,
  ScreenshotEditorSearchOptions,
} from '../editor-search-types';
const thumbnail = vi.hoisted(() => ({ specs: undefined as (() => { id: string }[]) | undefined }));
vi.mock('../../screenshot/composition/thumbnails/useLayerThumbnails', () => ({
  useLayerThumbnails: (specs: () => { id: string }[]) => {
    thumbnail.specs = specs;
    return ref({});
  },
}));
enableAutoUnmount(afterEach);
const base = {
  enabled: true,
  order: 0,
  timelineStartMs: 2000,
  timelineDurationMs: 1000,
  sourceInMs: 1200,
  sourceDurationMs: 1000,
  playbackRate: 1,
};
const videoFixture = () => {
  const composition = ref(emptyComposition());
  composition.value.assets = [
    {
      id: 'video',
      kind: 'video',
      name: 'Movie',
      src: 'movie',
      fileName: null,
      durationMs: 10000,
      width: 100,
      height: 100,
      origin: 'project',
    },
    {
      id: 'image',
      kind: 'image',
      name: 'Still',
      src: 'still',
      fileName: null,
      durationMs: 1000,
      width: 100,
      height: 100,
      origin: 'project',
    },
    {
      id: 'audio',
      kind: 'audio',
      name: 'Sound',
      src: 'sound',
      fileName: null,
      durationMs: 1000,
      width: null,
      height: null,
      origin: 'project',
    },
  ];
  composition.value.clips = [
    { ...base, id: 'movie', kind: 'video', name: 'Movie', assetId: 'video' },
    { ...base, id: 'freeze', kind: 'video', name: 'Freeze', assetId: 'video', freezeFrameSourceMs: 3000 },
    { ...base, id: 'still', kind: 'image', name: 'Still', assetId: 'image' },
    { ...base, id: 'missing', kind: 'video', name: '', assetId: 'missing' },
    { ...base, id: 'sound', kind: 'audio', name: 'Sound', assetId: 'audio' },
    {
      ...base,
      id: 'shape',
      kind: 'shape',
      name: 'Shape',
      ...normalizeShapeLayerStyle({ family: 'shape' }),
      transform: { x: 0, y: 0, width: 1, height: 1 },
    },
    {
      ...base,
      id: 'caption',
      kind: 'caption',
      name: 'Caption',
      caption: {
        type: 'text',
        style: createDefaultCaptionStyle(),
        sentences: [{ id: 'caption-line', text: 'Hello world', startMs: 0, endMs: 1000, words: [] }],
      },
    },
    { ...base, id: 'color', kind: 'color', name: 'Background', assetId: '', fill: DEFAULT_COLOR_FILL },
  ] as Clip[];
  const selected = ref<Clip | null>(null),
    zoom = ref<unknown>(null),
    clipSelect = vi.fn(),
    zoomSelect = vi.fn(),
    add = vi.fn(async () => {});
  const zoomState = {
    selectedZoomId: ref<string | null>('z'),
    selectedZoomIds: ref(['z']),
    selectedZoom: zoom,
    zoomElements: ref([
      { id: 'z', depth: 1, startMs: 4000, mode: 'auto' },
      { id: 'tilt', depth: 2, startMs: 5000, mode: 'manual', tiltPreset: 'tilt-back' },
    ]),
    selectZooms: zoomSelect,
  };
  const options = {
    compositionState: { composition, selectedClip: selected, selectClip: clipSelect, selectClips: clipSelect },
    zoomState,
    addEditorElement: add,
    canInsert: () => true,
  } as unknown as VideoEditorSearchOptions;
  let context!: EditorSearchContext;
  mount(
    defineComponent({
      setup() {
        context = provideVideoEditorSearch(options);
        return () => h('div');
      },
    }),
  );
  context.setNavigator(vi.fn());
  return { context, selected, zoom, zoomState, clipSelect, zoomSelect, add };
};
describe('editor search domain adapters', () => {
  it('builds live video/image/shape previews and actual clip names without media for audio or missing assets', async () => {
    const f = videoFixture();
    const actions = f.context.actions.value;
    expect(actions.find((item) => item.id === 'clip:movie')!.preview).toMatchObject({ kind: 'video', timeSec: 1.2 });
    expect(actions.find((item) => item.id === 'clip:freeze')!.preview).toMatchObject({ timeSec: 3 });
    expect(actions.find((item) => item.id === 'clip:still')!.preview).toMatchObject({ kind: 'image', src: 'still' });
    expect(actions.find((item) => item.id === 'clip:shape')!.preview).toMatchObject({ kind: 'shape' });
    expect(actions.find((item) => item.id === 'clip:color')!.preview).toMatchObject({ kind: 'color' });
    expect(actions.find((item) => item.id === 'clip:caption')!.terms).toContain(' Hello world');
    expect(actions.find((item) => item.id === 'clip:missing')!.label).toBe('Clip');
    expect(actions.find((item) => item.id === 'clip:sound')!.preview).toBeUndefined();
    await actions.find((item) => item.id === 'clip:movie')!.run();
    expect(f.zoomState.selectedZoomIds.value).toEqual([]);
    expect(f.clipSelect).toHaveBeenCalledWith('movie');
    await actions.find((item) => item.id === 'zoom:z')!.run();
    expect(f.clipSelect).toHaveBeenCalledWith([]);
    expect(f.zoomSelect).toHaveBeenCalledWith(['z'], 'z');
    await actions.find((item) => item.id === 'insert:image')!.run();
    expect(f.add).toHaveBeenCalledWith('image');
  });
  it('marks unavailable or locked video properties and zoom settings disabled', () => {
    const f = videoFixture();
    expect(f.context.actions.value.find((item) => item.id === 'setting:ZoomPanel.mode')!.disabled).toBe(true);
    f.selected.value = { ...base, kind: 'image', id: 'x', name: 'x', locked: true } as Clip;
    expect(
      f.context.actions.value.find((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')!.disabled,
    ).toBe(true);
    f.selected.value.locked = false;
    expect(
      f.context.actions.value.find((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')!.disabled,
    ).toBe(false);
    f.zoom.value = { locked: true };
    expect(f.context.actions.value.find((item) => item.id === 'setting:ZoomPanel.mode')!.disabled).toBe(true);
    f.zoom.value = { locked: false };
    expect(f.context.actions.value.find((item) => item.id === 'setting:ZoomPanel.mode')!.disabled).toBe(false);
  });
  it('uses the same generic context in Screenshot and requests thumbnails only for visible project layers', async () => {
    const options: ScreenshotEditorSearchOptions = {
      state: ref(null),
      document: ref(null),
      packs: () => [],
      selectedId: ref(null),
      canInsert: () => true,
      insert: vi.fn(),
      select: vi.fn(),
    };
    let context!: EditorSearchContext;
    mount(
      defineComponent({
        setup() {
          context = provideScreenshotEditorSearch(options);
          return () => h('div');
        },
      }),
    );
    expect(context.actions.value.filter((item) => item.group === 'selection')).toEqual([]);
    expect(thumbnail.specs!()).toEqual([]);
    options.document.value = documentFixture();
    options.state.value = screenshotState(options.document.value);
    context.setNavigator(vi.fn());
    expect(context.actions.value.filter((item) => item.group === 'selection').length).toBeGreaterThan(0);
    await context.actions.value.find((item) => item.id === 'clip:screenshot')!.run();
    expect(options.select).toHaveBeenCalledWith('screenshot');
    context.open.value = true;
    context.setVisibleActions(['clip:screenshot']);
    expect(thumbnail.specs!().map((spec) => spec.id)).toEqual(['screenshot']);
    options.selectedId.value = 'screenshot';
    expect(context.actions.value.some((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')).toBe(true);
    options.state.value.composition = [{ id: 'screenshot', locked: true, opacity: 1, blendMode: 'source-over' }];
    expect(context.actions.value.find((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')!.disabled).toBe(
      true,
    );
    options.state.value.shapes.push({
      ...base,
      id: 'shape',
      kind: 'shape',
      assetId: '',
      name: 'Text',
      ...normalizeShapeLayerStyle({ family: 'text' }),
      transform: { x: 0, y: 0, width: 1, height: 1 },
    });
    options.selectedId.value = 'shape';
    expect(context.actions.value.some((item) => item.id === 'setting:Elements.editText')).toBe(true);
    options.state.value.effects = [
      {
        ...base,
        id: 'effect',
        kind: 'blur',
        assetId: '',
        name: '',
        shape: 'rectangle',
        mode: 'blur',
        strength: 50,
        feather: 0,
        tintOpacity: 0,
        color: '#000000',
        transform: { x: 0, y: 0, width: 1, height: 1 },
      },
    ];
    insertScreenshotLayer(options.state.value, 'effect');
    expect(context.actions.value.find((item) => item.id === 'clip:effect')!.label).toBe('Blur');
    options.selectedId.value = 'effect';
    expect(context.actions.value.some((item) => item.id === 'setting:BlurPropertiesPanel.mode')).toBe(true);
    options.state.value.cursors = [
      {
        id: 'cursor',
        name: 'Cursor',
        enabled: true,
        position: { x: 0, y: 0 },
        size: 32,
        rotation: 0,
        selection: { packId: 'builtin:macos', cursorId: 'default', mode: 'fixed' },
        color: '#ffffff',
        shadowEnabled: false,
        shadowBlur: 0,
        shadowColor: '#000000',
        shadowDirection: 'all',
      },
    ];
    insertScreenshotLayer(options.state.value, 'cursor');
    options.selectedId.value = 'cursor';
    expect(context.actions.value.some((item) => item.id === 'setting:CursorPanel.cursorStyle')).toBe(true);
    expect(context.actions.value.some((item) => item.id === 'setting:ClipPropertiesPanel.cornerRadius')).toBe(false);
    context.open.value = false;
    context.setVisibleActions([]);
    expect(thumbnail.specs!()).toEqual([]);
    await flushPromises();
  });
});
