import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
  resetPropertyInteractions,
} from '~/composables/property-interaction';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { NormalizedTransform } from '~/media/shared/composition-types';
import type { ScreenshotRenderAssets } from '../screenshot-types';
import { screenshotShape, screenshotState } from '../screenshot-state';

const renderer = vi.hoisted(() => ({
  loadScreenshotAssets: vi.fn(),
  drawScreenshot: vi.fn(),
}));
const dragRenderer = vi.hoisted(() => ({
  draw: vi.fn(),
  reset: vi.fn(),
}));
const measurement = vi.hoisted(() => ({
  set: null as null | ((width: number, height: number) => void),
}));

vi.mock('../screenshot-render', () => renderer);
vi.mock('../screenshot-drag-renderer', () => ({
  createScreenshotDragRenderer: () => dragRenderer,
}));
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  return {
    useElementSize: () => {
      const width = ref(0);
      const height = ref(0);
      measurement.set = (nextWidth, nextHeight) => {
        width.value = nextWidth;
        height.value = nextHeight;
      };
      return { width, height };
    },
  };
});

import ScreenshotCanvas from '../ScreenshotCanvas.vue';

const assets: ScreenshotRenderAssets = {
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 1200,
  height: 800,
};

const stateFixture = (): ScreenshotState => {
  const document: ScreenshotDocument = {
    id: 'screen-1',
    name: 'Captured screen',
    width: 1200,
    height: 800,
    source: 'project-media://screenshot/screen-1/source.png',
    preset: {
      editor: { schemaVersion: 1 },
      devices: {},
      export: { format: 'png', resolution: '1080p' },
      quickSnip: { automaticZoom: false },
    } satisfies EditorPresetSettings,
    state: null,
  };
  const state = screenshotState(document);
  state.shapes = [screenshotShape('rounded-rectangle', 'shape-selected')];
  return state;
};

const SelectionStub = defineComponent({
  name: 'CanvasLayerSelection',
  props: { handleStyle: Object, viewportStyle: Object, muted: Boolean },
  emits: ['pointer-down', 'pointer-move', 'pointer-up', 'resize-start', 'resize-move', 'resize-end'],
  template:
    '<div data-testid="layer-selection" :data-muted="String(muted)" :style="handleStyle" @pointerdown="$emit(\'pointer-down\', $event)" @pointermove="$emit(\'pointer-move\', $event)" @pointerup="$emit(\'pointer-up\', $event)" @pointercancel="$emit(\'pointer-up\', $event)" />',
});

const mountCanvas = () =>
  mount(ScreenshotCanvas, {
    props: {
      source: 'project-media://screenshot/screen-1/source.png',
      state: stateFixture(),
      selectedId: 'shape-selected',
    },
    global: {
      stubs: {
        CanvasLayerSelection: SelectionStub,
        ElementCanvasOverlay: true,
        ScreenshotCropSelection: true,
      },
    },
  });

let animationFrames: Map<number, FrameRequestCallback>;
let frameId: number;
let requestFrame: ReturnType<typeof vi.spyOn>;

const flushOneFrame = () => {
  const next = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
  if (!next) throw new Error('No animation frame was scheduled.');
  animationFrames.delete(next[0]);
  next[1](16);
};

const prepareCanvas = async () => {
  const wrapper = mountCanvas();
  measurement.set?.(800, 600);
  await flushPromises();
  while (animationFrames.size) flushOneFrame();
  await flushPromises();
  return wrapper;
};

const pointerEvent = (values: Partial<PointerEvent> = {}) =>
  ({
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 7,
    currentTarget: { setPointerCapture: vi.fn() },
    preventDefault: vi.fn(),
    ...values,
  }) as unknown as PointerEvent;

const setCanvasBounds = (wrapper: ReturnType<typeof mountCanvas>) => {
  vi.spyOn(wrapper.get('canvas').element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect);
};

beforeEach(() => {
  vi.clearAllMocks();
  resetPropertyInteractions();
  measurement.set = null;
  renderer.loadScreenshotAssets.mockResolvedValue(assets);
  animationFrames = new Map();
  frameId = 0;
  requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++frameId;
    animationFrames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    animationFrames.delete(id);
  });
  vi.stubGlobal(
    'ResizeObserver',
    class TestResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
});

afterEach(() => {
  resetPropertyInteractions();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ScreenshotCanvas interaction performance', () => {
  it('coalesces pointer moves to one animation frame and flushes the last transform on release', async () => {
    const wrapper = await prepareCanvas();
    setCanvasBounds(wrapper);
    const selection = wrapper.findComponent(SelectionStub);
    const start = pointerEvent({ clientX: 45, clientY: 40 });
    selection.vm.$emit('pointer-down', start);
    dragRenderer.draw.mockClear();

    const callsBeforeMoves = requestFrame.mock.calls.length;
    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 65, clientY: 60 }));
    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 75, clientY: 65 }));
    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 80, clientY: 70 }));

    expect(requestFrame).toHaveBeenCalledTimes(callsBeforeMoves + 1);
    expect(animationFrames.size).toBe(1);
    expect(wrapper.emitted('transform')).toBeUndefined();

    flushOneFrame();
    await nextTick();
    expect(wrapper.emitted('transform')).toBeUndefined();
    expect(dragRenderer.draw).toHaveBeenCalledOnce();
    expect(dragRenderer.draw.mock.calls[0]?.[1].shapes[0]?.transform.x).toBeCloseTo(0.65);
    expect(dragRenderer.draw.mock.calls[0]?.[1].shapes[0]?.transform.y).toBeCloseTo(0.6);

    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 85, clientY: 75 }));
    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 90, clientY: 80 }));
    expect(wrapper.emitted('transform')).toBeUndefined();
    expect(dragRenderer.draw).toHaveBeenCalledOnce();
    selection.vm.$emit('pointer-up', pointerEvent({ clientX: 90, clientY: 80 }));

    expect(wrapper.emitted('transform')).toHaveLength(1);
    const committed = wrapper.emitted('transform')?.[0]?.[0] as NormalizedTransform | undefined;
    expect(committed?.x).toBeCloseTo(0.75);
    expect(committed?.y).toBeCloseTo(0.7);
    while (animationFrames.size) flushOneFrame();
    await flushPromises();
    expect(wrapper.emitted('transform')).toHaveLength(1);
    expect(dragRenderer.draw).toHaveBeenCalledOnce();
    expect(propertyInteractionActive.value).toBe(false);
    wrapper.unmount();
  });

  it('mutes selection during another property interaction but unmutes it during canvas dragging', async () => {
    const wrapper = await prepareCanvas();
    const selection = wrapper.get('[data-testid="layer-selection"]');
    expect(selection.attributes('data-muted')).toBe('false');

    beginPropertyInteraction();
    await flushPromises();
    expect(selection.attributes('data-muted')).toBe('true');

    wrapper.findComponent(SelectionStub).vm.$emit('resize-start', 'bottom-right', pointerEvent());
    await flushPromises();
    expect(propertyInteractionActive.value).toBe(true);
    expect(selection.attributes('data-muted')).toBe('false');

    wrapper.findComponent(SelectionStub).vm.$emit('resize-end', pointerEvent());
    await flushPromises();
    expect(propertyInteractionActive.value).toBe(true);
    expect(selection.attributes('data-muted')).toBe('true');

    endPropertyInteraction();
    await flushPromises();
    expect(selection.attributes('data-muted')).toBe('false');
    wrapper.unmount();
  });

  it('positions the selection with translate3d for compositor-friendly movement', async () => {
    const wrapper = await prepareCanvas();
    const style = wrapper.get('[data-testid="layer-selection"]').attributes('style');

    expect(style).toContain('translate3d(');
    expect(style).toContain('rotate(0deg)');
    expect(style).not.toContain('translate(');
    wrapper.unmount();
  });

  it('publishes the latest draft during unmount so an interrupted gesture is not lost', async () => {
    const wrapper = await prepareCanvas();
    setCanvasBounds(wrapper);
    const selection = wrapper.findComponent(SelectionStub);
    selection.vm.$emit('pointer-down', pointerEvent({ clientX: 45, clientY: 40 }));
    selection.vm.$emit('pointer-move', pointerEvent({ clientX: 85, clientY: 90 }));
    wrapper.unmount();

    expect(wrapper.emitted('transform')).toEqual([[expect.objectContaining({ x: 0.7, y: 0.8 })]]);
    expect(propertyInteractionActive.value).toBe(false);
  });
});
