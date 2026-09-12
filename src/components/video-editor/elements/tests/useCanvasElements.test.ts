import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, provide, ref } from 'vue';
import type { ShapeClip } from '~/media/shared/composition-types';
import { createElementText } from '~/media/shared/element-text';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ElementEditorContext } from '../element-editor-types';
import { ELEMENT_EDITOR } from '../useElementEditor';
import { useCanvasElements } from '../useCanvasElements';
import type { VideoWindowBounds } from '../../canvas/composables/useCameraZoom';

const mocks = vi.hoisted(() => ({
  loadElementFonts: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('~/media/shared/element-fonts', () => ({ loadElementFonts: mocks.loadElementFonts }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => ({ error: mocks.toastError }) }));

const makeTextLayer = (id: string, fontAssetId?: string): ShapeClip => {
  const text = createElementText('Editable element');
  if (fontAssetId) text.style.fontAssetId = fontAssetId;
  return {
    id,
    trackId: id,
    kind: 'shape',
    assetId: '',
    name: id,
    enabled: true,
    order: 0,
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    ...normalizeShapeLayerStyle({ family: 'text', preset: 'text' }),
    transform: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
    text,
  };
};

interface HarnessOptions {
  provideEditor?: boolean;
  initialLayers?: ShapeClip[];
  initialBounds?: VideoWindowBounds | null;
  preview?: { x: number; y: number; width: number; height: number };
}

const wrappers: VueWrapper[] = [];

const mountCanvasElements = (configuration: HarnessOptions = {}) => {
  const layers = ref<ShapeClip[]>(configuration.initialLayers ?? []);
  const editing = ref<ShapeClip | null>(null);
  const drawingMode = ref(false);
  const bounds = ref<VideoWindowBounds | null>(configuration.initialBounds ?? null);
  const canEditValue = ref(true);
  const canEdit = vi.fn(() => canEditValue.value);
  const clipIdAt = vi.fn((): string | null => null);
  const render = vi.fn();
  const editor = {
    layers: computed(() => layers.value),
    editing,
    drawingMode,
    beginText: vi.fn(() => true),
    finishText: vi.fn(() => {
      editing.value = null;
    }),
  } as unknown as ElementEditorContext;
  const options = {
    bounds: () => bounds.value,
    preview: () => configuration.preview ?? { x: 12, y: 24, width: 800, height: 450 },
    clipIdAt,
    canEdit,
    render,
  };

  let canvasElements!: ReturnType<typeof useCanvasElements>;
  const Consumer = defineComponent({
    setup() {
      canvasElements = useCanvasElements(options);
      return () => null;
    },
  });
  const Host = defineComponent({
    setup() {
      if (configuration.provideEditor !== false) provide(ELEMENT_EDITOR, editor);
      return () => h(Consumer);
    },
  });
  const wrapper = mount(Host);
  wrappers.push(wrapper);

  return {
    wrapper,
    canvasElements,
    editor,
    layers,
    editing,
    drawingMode,
    bounds,
    canEditValue,
    canEdit,
    clipIdAt,
    render,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadElementFonts.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('useCanvasElements', () => {
  it('works without an editor provider and uses the preview viewport fallback', () => {
    const state = mountCanvasElements({ provideEditor: false, preview: { x: 5, y: 7, width: 640, height: 360 } });
    state.clipIdAt.mockReturnValue('orphan-target');

    expect(state.canvasElements.editor).toBeNull();
    expect(state.canvasElements.viewport.value).toEqual({ x: 5, y: 7, width: 640, height: 360 });
    expect(state.canvasElements.begin(new MouseEvent('mousedown', { button: 0 }))).toBe(false);
    expect(state.clipIdAt).toHaveBeenCalledOnce();
    expect(mocks.loadElementFonts).not.toHaveBeenCalled();
    expect(state.render).not.toHaveBeenCalled();
  });

  it('uses camera bounds when available and falls back when they are cleared', () => {
    const state = mountCanvasElements({
      preview: { x: 10, y: 20, width: 800, height: 450 },
    });
    expect(state.canvasElements.viewport.value).toEqual({ x: 10, y: 20, width: 800, height: 450 });

    state.bounds.value = { dx: 45, dy: 30, dw: 600, dh: 338, scale: 0.75, focusX: 345, focusY: 199 };
    expect(state.canvasElements.viewport.value).toEqual({ x: 45, y: 30, width: 600, height: 338 });

    state.bounds.value = null;
    expect(state.canvasElements.viewport.value).toEqual({ x: 10, y: 20, width: 800, height: 450 });
  });

  it('waits for imported element fonts before requesting a render', async () => {
    const fontId = 'a'.repeat(64);
    const layer = makeTextLayer('text-with-font', fontId);
    let resolveLoad!: () => void;
    mocks.loadElementFonts.mockReturnValueOnce(new Promise<void>((resolve) => (resolveLoad = resolve)));
    const state = mountCanvasElements({ initialLayers: [layer] });

    expect(mocks.loadElementFonts).toHaveBeenCalledWith([layer]);
    expect(state.render).not.toHaveBeenCalled();

    resolveLoad();
    await vi.waitFor(() => expect(state.render).toHaveBeenCalledOnce());
  });

  it('reports font loading failures through the toast store without rendering', async () => {
    mocks.loadElementFonts.mockRejectedValueOnce(new Error('font could not be loaded'));
    const state = mountCanvasElements({ initialLayers: [makeTextLayer('broken-font', 'b'.repeat(64))] });

    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Error: font could not be loaded'));
    expect(state.render).not.toHaveBeenCalled();
  });

  it('guards text hit testing by mouse button and edit permission', async () => {
    const state = mountCanvasElements();
    state.canEdit.mockClear();
    state.clipIdAt.mockReturnValue('target');

    expect(state.canvasElements.begin(new MouseEvent('mousedown', { button: 2 }))).toBe(false);
    expect(state.canEdit).not.toHaveBeenCalled();
    expect(state.clipIdAt).not.toHaveBeenCalled();

    state.canEditValue.value = false;
    await nextTick();
    state.canEdit.mockClear();
    expect(state.canvasElements.begin(new MouseEvent('mousedown', { button: 0 }))).toBe(false);
    expect(state.canEdit).toHaveBeenCalledOnce();
    expect(state.clipIdAt).not.toHaveBeenCalled();
    expect(state.editor.beginText).not.toHaveBeenCalled();

    state.canEditValue.value = true;
    await nextTick();
    state.canEdit.mockClear();
    state.clipIdAt.mockReturnValue(null);
    expect(state.canvasElements.begin(new MouseEvent('mousedown', { button: 0 }))).toBe(false);
    expect(state.canEdit).toHaveBeenCalledOnce();
    expect(state.clipIdAt).toHaveBeenCalledOnce();
    expect(state.editor.beginText).not.toHaveBeenCalled();

    state.clipIdAt.mockReturnValue('target');
    expect(state.canvasElements.begin(new MouseEvent('mousedown', { button: 0 }))).toBe(true);
    expect(state.clipIdAt).toHaveBeenCalledTimes(2);
    expect(state.editor.beginText).toHaveBeenCalledWith('target');
  });

  it('finishes text editing and exits drawing mode when editing becomes unavailable', async () => {
    const state = mountCanvasElements();
    state.editing.value = makeTextLayer('editing');
    state.drawingMode.value = true;
    state.canEditValue.value = false;

    await vi.waitFor(() => expect(state.editor.finishText).toHaveBeenCalledOnce());

    expect(state.editing.value).toBeNull();
    expect(state.drawingMode.value).toBe(false);
    expect(state.render).toHaveBeenCalled();
  });
});
