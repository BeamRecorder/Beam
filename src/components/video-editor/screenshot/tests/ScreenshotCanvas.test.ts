import { defineComponent, nextTick, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { propertyInteractionActive, resetPropertyInteractions } from '~/composables/property-interaction';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { EditorPresetSettings } from '~/api/types/editor-preset';
import type { ScreenshotDocument, ScreenshotState } from '~/api/types/screenshot';
import type { ScreenshotRenderAssets } from '../screenshot-types';
import type { ScreenshotCursorAsset } from '../screenshot-layer-types';
import { createScreenshotCursor, screenshotCursorTransform } from '../screenshot-cursors';
import { initializeScreenshotComposition } from '../screenshot-layers';
import { screenshotShape, screenshotState } from '../screenshot-state';

const renderer = vi.hoisted(() => ({
  loadScreenshotAssets: vi.fn(),
  drawScreenshot: vi.fn(),
}));
const measurement = vi.hoisted(() => ({
  set: null as null | ((width: number, height: number) => void),
}));

vi.mock('../screenshot-render', () => renderer);
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

const stateFixture = (): ScreenshotState => {
  const document: ScreenshotDocument = {
    id: 'screen-1',
    name: 'Captured screen',
    width: 2000,
    height: 1000,
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
  state.image.transform = { x: 0, y: 0, width: 0.5, height: 0.5 };
  const lower = screenshotShape('rounded-rectangle', 'shape-lower');
  lower.transform = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  const upper = screenshotShape('ellipse', 'shape-upper');
  upper.transform = { x: 0.4, y: 0.4, width: 0.4, height: 0.4 };
  state.shapes = [lower, upper];
  return state;
};

const assets: ScreenshotRenderAssets = {
  image: {} as CanvasImageSource,
  background: null,
  logo: null,
  width: 2000,
  height: 1000,
  cursors: new Map(),
};

const pointer: CursorAssetDescriptor = {
  id: 'pointer',
  label: 'Pointer',
  url: 'project-media://cursor/pack/pointer.svg',
  format: 'svg',
  tintable: true,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 8, y: 4 },
};
const cursorPack: CursorPackDescriptor = {
  id: 'pack:sample',
  name: 'Sample',
  source: 'imported',
  colorMode: 'tintable',
  defaultCursorId: pointer.id,
  cursors: [pointer],
  automaticMap: { default: pointer.id },
};

const SelectionStub = defineComponent({
  name: 'CanvasLayerSelection',
  props: { handleStyle: Object, viewportStyle: Object },
  emits: ['pointer-down', 'pointer-move', 'pointer-up', 'resize-start', 'resize-move', 'resize-end'],
  template:
    '<div data-testid="layer-selection" :style="handleStyle" @pointerdown="$emit(\'pointer-down\', $event)" @pointermove="$emit(\'pointer-move\', $event)" @pointerup="$emit(\'pointer-up\', $event)" @pointercancel="$emit(\'pointer-up\', $event)" />',
});

let animationFrames: Map<number, FrameRequestCallback>;
let frameSequence: number;

const flushAnimationFrames = async () => {
  while (animationFrames.size) {
    const next = animationFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!next) break;
    animationFrames.delete(next[0]);
    next[1](16);
    await nextTick();
  }
  await flushPromises();
};

const mountCanvas = (
  state = stateFixture(),
  selectedId: string | null = null,
  cursorPacks?: CursorPackDescriptor[],
  cursorPacksReady?: boolean,
) =>
  mount(ScreenshotCanvas, {
    props: {
      source: 'project-media://screenshot/screen-1/source.png',
      state,
      selectedId,
      cursorPacks,
      cursorPacksReady,
    },
    global: { stubs: { CanvasLayerSelection: SelectionStub } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetPropertyInteractions();
  measurement.set = null;
  animationFrames = new Map();
  frameSequence = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++frameSequence;
    animationFrames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    animationFrames.delete(id);
  });
  renderer.loadScreenshotAssets.mockResolvedValue(assets);
  assets.cursors = new Map<string, ScreenshotCursorAsset>();
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

describe('ScreenshotCanvas', () => {
  it('waits for measured stage dimensions, then draws at the capped resolution and selects the topmost shape', async () => {
    const wrapper = mountCanvas();
    await flushPromises();

    const canvas = wrapper.get('canvas');
    expect(renderer.drawScreenshot).not.toHaveBeenCalled();
    measurement.set?.(800, 600);
    await flushPromises();
    await flushAnimationFrames();

    expect(canvas.element.width).toBe(1600);
    expect(canvas.element.height).toBe(800);
    expect(renderer.loadScreenshotAssets.mock.calls[0]?.[0]).toBe('project-media://screenshot/screen-1/source.png');
    expect(renderer.loadScreenshotAssets.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        canvas: expect.objectContaining({ width: 2000, height: 1000 }),
      }),
    );
    expect(renderer.loadScreenshotAssets.mock.calls[0]?.[2]).toBeUndefined();
    expect(renderer.drawScreenshot).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        canvas: expect.objectContaining({ width: 2000, height: 1000 }),
      }),
      assets,
      1600,
      800,
      undefined,
    );
    expect(wrapper.emitted('ready')).toEqual([[]]);

    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 120,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);
    await canvas.trigger('pointerdown', {
      clientX: 60,
      clientY: 70,
      pointerId: 1,
    });
    expect(wrapper.emitted('select')).toEqual([['shape-upper']]);

    await wrapper.setProps({ selectedId: 'shape-upper' });
    const selectionStyle = wrapper.get('[data-testid="layer-selection"]').attributes('style');
    expect(selectionStyle).toContain('width: 40%');
    expect(selectionStyle).toContain('height: 40%');
    expect(selectionStyle).toContain('translate3d(320px, 160px, 0)');
    wrapper.unmount();
  });

  it('loads cursor assets from the supplied packs and selects a cursor above overlapping artwork', async () => {
    const state = stateFixture();
    const cursor = createScreenshotCursor('cursor-1', 'Pointer', cursorPack);
    cursor.position = { x: 0.48, y: 0.48 };
    state.cursors = [cursor];
    initializeScreenshotComposition(state);
    assets.cursors = new Map([[cursor.id, { image: {} as CanvasImageSource, asset: pointer }]]);
    const wrapper = mountCanvas(state, null, [cursorPack]);
    measurement.set?.(800, 600);
    await flushPromises();

    const call = renderer.loadScreenshotAssets.mock.calls[0];
    expect(call?.[0]).toBe('project-media://screenshot/screen-1/source.png');
    expect(call?.[1]).toMatchObject({
      image: expect.objectContaining({ id: 'screenshot' }),
      cursors: [cursor],
    });
    expect(call?.[2]).toEqual([cursorPack]);
    expect(renderer.drawScreenshot).toHaveBeenCalledWith(expect.any(Object), state, assets, 1600, 800, undefined);

    const bounds = screenshotCursorTransform(cursor, state.canvas, pointer);
    const canvas = wrapper.get('canvas');
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
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
    await canvas.trigger('pointerdown', {
      clientX: (bounds.x + bounds.width / 2) * 100,
      clientY: (bounds.y + bounds.height / 2) * 100,
      pointerId: 1,
    });

    expect(wrapper.emitted('select')).toEqual([['cursor-1']]);
    wrapper.unmount();
  });

  it('selects an overlapping layer before moving the selected image, then moves it once selected', async () => {
    const state = stateFixture();
    const wrapper = mountCanvas(state, state.image.id);
    measurement.set?.(800, 600);
    await flushPromises();

    const canvas = wrapper.get('canvas');
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
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
    const selection = wrapper.findComponent(SelectionStub);
    const captureTarget = { setPointerCapture: vi.fn() };
    const pointerDown = {
      button: 0,
      clientX: 45,
      clientY: 45,
      pointerId: 7,
      currentTarget: captureTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;

    selection.vm.$emit('pointer-down', pointerDown);
    selection.vm.$emit('pointer-move', {
      ...pointerDown,
      clientX: 55,
      clientY: 55,
    });
    expect(wrapper.emitted('select')).toEqual([['shape-upper']]);
    expect(pointerDown.stopPropagation).toHaveBeenCalledOnce();
    expect(pointerDown.preventDefault).not.toHaveBeenCalled();
    expect(captureTarget.setPointerCapture).not.toHaveBeenCalled();
    expect(wrapper.emitted('transform')).toBeUndefined();

    await wrapper.setProps({ selectedId: 'shape-upper' });
    const selectedPointerDown = {
      ...pointerDown,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;
    selection.vm.$emit('pointer-down', selectedPointerDown);
    const moveEvent = {
      ...selectedPointerDown,
      clientX: 55,
      clientY: 55,
    } as unknown as PointerEvent;
    selection.vm.$emit('pointer-move', moveEvent);

    expect(selectedPointerDown.preventDefault).toHaveBeenCalledOnce();
    expect(selectedPointerDown.stopPropagation).not.toHaveBeenCalled();
    expect(captureTarget.setPointerCapture).toHaveBeenCalledWith(7);
    expect(wrapper.emitted('transform')).toBeUndefined();
    selection.vm.$emit('pointer-up', moveEvent);
    expect(wrapper.emitted('transform')).toHaveLength(1);
    expect(wrapper.emitted('transform')?.[0]?.[0]).toMatchObject({ x: 0.5, y: 0.5 });
    wrapper.unmount();
  });

  it('keeps move and resize interactions grouped until pointer-up, cancellation, or unmount', async () => {
    const wrapper = mountCanvas(stateFixture(), 'shape-upper');
    measurement.set?.(800, 600);
    await flushPromises();

    const selection = wrapper.findComponent(SelectionStub);
    const pointerDown = {
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 12,
      currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: vi.fn(),
    } as unknown as PointerEvent;
    selection.vm.$emit('resize-start', 'bottom-right', pointerDown);
    expect(propertyInteractionActive.value).toBe(true);

    selection.vm.$emit('resize-move', { ...pointerDown, clientX: 60 });
    expect(propertyInteractionActive.value).toBe(true);
    await selection.get('[data-testid="layer-selection"]').trigger('pointercancel', { pointerId: 12 });
    expect(propertyInteractionActive.value).toBe(false);

    selection.vm.$emit('resize-start', 'bottom-right', pointerDown);
    expect(propertyInteractionActive.value).toBe(true);
    selection.vm.$emit('pointer-up', pointerDown);
    expect(propertyInteractionActive.value).toBe(false);

    selection.vm.$emit('resize-start', 'bottom-right', pointerDown);
    expect(propertyInteractionActive.value).toBe(true);
    wrapper.unmount();
    expect(propertyInteractionActive.value).toBe(false);
  });

  it('does not paint stale assets during successive cursor-asset loads', async () => {
    let resolveOldRequest!: (value: ScreenshotRenderAssets) => void;
    let resolveCurrentRequest!: (value: ScreenshotRenderAssets) => void;
    renderer.loadScreenshotAssets
      .mockResolvedValueOnce(assets)
      .mockImplementationOnce(() => new Promise<ScreenshotRenderAssets>((resolve) => (resolveOldRequest = resolve)))
      .mockImplementationOnce(
        () => new Promise<ScreenshotRenderAssets>((resolve) => (resolveCurrentRequest = resolve)),
      );
    const state = reactive(stateFixture());
    const wrapper = mountCanvas(state, null, [cursorPack], true);
    measurement.set?.(800, 600);
    await flushPromises();
    await flushAnimationFrames();

    expect(renderer.loadScreenshotAssets).toHaveBeenCalledOnce();
    expect(renderer.drawScreenshot).toHaveBeenCalled();
    renderer.drawScreenshot.mockClear();

    state.cursors = [createScreenshotCursor('cursor-1', 'Pointer', cursorPack)];
    initializeScreenshotComposition(state);
    await flushPromises();
    expect(renderer.loadScreenshotAssets).toHaveBeenCalledTimes(2);
    expect(renderer.drawScreenshot).not.toHaveBeenCalled();
    expect(wrapper.emitted('error')).toBeUndefined();

    state.cursors[0]!.color = '#ff0000';
    await flushPromises();
    expect(renderer.loadScreenshotAssets).toHaveBeenCalledTimes(3);
    expect(renderer.drawScreenshot).not.toHaveBeenCalled();

    const staleAssets = {
      ...assets,
      cursors: new Map([['cursor-1', { image: {} as CanvasImageSource, asset: pointer }]]),
    };
    resolveOldRequest(staleAssets);
    await flushPromises();
    expect(renderer.drawScreenshot).not.toHaveBeenCalled();
    expect(wrapper.emitted('error')).toBeUndefined();

    const currentAssets = {
      ...assets,
      cursors: new Map([['cursor-1', { image: {} as CanvasImageSource, asset: pointer }]]),
    };
    resolveCurrentRequest(currentAssets);
    await flushPromises();
    await flushAnimationFrames();

    expect(renderer.drawScreenshot).toHaveBeenCalled();
    expect(renderer.drawScreenshot.mock.calls.every((call) => call[2] === currentAssets)).toBe(true);
    expect(wrapper.emitted('error')).toBeUndefined();
    wrapper.unmount();
  });

  it('waits for cursor packs before loading an enabled cursor with an unavailable pack', async () => {
    const state = stateFixture();
    const cursor = createScreenshotCursor('cursor-pending', 'Pointer', cursorPack);
    state.cursors = [cursor];
    const wrapper = mountCanvas(state, null, [], false);
    measurement.set?.(800, 600);
    await flushPromises();

    expect(renderer.loadScreenshotAssets).not.toHaveBeenCalled();
    expect(renderer.drawScreenshot).not.toHaveBeenCalled();
    expect(wrapper.emitted('error')).toBeUndefined();

    await wrapper.setProps({
      cursorPacks: [cursorPack],
      cursorPacksReady: true,
    });
    await flushPromises();

    expect(renderer.loadScreenshotAssets).toHaveBeenCalledOnce();
    expect(renderer.loadScreenshotAssets.mock.calls[0]?.[2]).toEqual([cursorPack]);
    expect(renderer.drawScreenshot).toHaveBeenCalledOnce();
    expect(wrapper.emitted('error')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ['no cursor', () => stateFixture(), []],
    [
      'a cursor whose pack is already supplied',
      () => {
        const state = stateFixture();
        state.cursors = [createScreenshotCursor('cursor-ready', 'Pointer', cursorPack)];
        initializeScreenshotComposition(state);
        return state;
      },
      [cursorPack],
    ],
  ] as const)('does not wait for cursor readiness with %s', async (_label, createState, cursorPacks) => {
    const wrapper = mountCanvas(createState(), null, [...cursorPacks], false);
    measurement.set?.(800, 600);
    await flushPromises();

    expect(renderer.loadScreenshotAssets).toHaveBeenCalledOnce();
    expect(renderer.drawScreenshot).toHaveBeenCalled();
    expect(wrapper.emitted('error')).toBeUndefined();
    wrapper.unmount();
  });

  it('resizes the visible cropped image instead of its unused fitting bounds', async () => {
    const state = stateFixture();
    state.image.transform = { x: 0, y: 0, width: 1, height: 1 };
    state.image.crop = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const wrapper = mountCanvas(state, state.image.id);
    measurement.set?.(800, 600);
    await flushPromises();
    await flushAnimationFrames();
    const canvas = wrapper.get('canvas');
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 500,
    } as DOMRect);
    const selection = wrapper.findComponent(SelectionStub);
    const event = {
      button: 0,
      clientX: 750,
      clientY: 250,
      pointerId: 1,
      preventDefault: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() },
    };
    selection.vm.$emit('resize-start', 'right', event);
    const moveEvent = { ...event, clientX: 850 };
    selection.vm.$emit('resize-move', moveEvent);
    expect(wrapper.emitted('transform')).toBeUndefined();
    selection.vm.$emit('resize-end', moveEvent);
    expect(wrapper.emitted('transform')?.[0]?.[0]).toMatchObject({
      x: 0.25,
      width: 0.6,
      height: 1.2,
    });
    await wrapper.setProps({ cropping: true });
    await flushAnimationFrames();
    expect(wrapper.findComponent(SelectionStub).exists()).toBe(false);
    expect(renderer.drawScreenshot.mock.calls.at(-1)?.[1].image.crop).toBeUndefined();
    expect(state.image.crop).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
    wrapper.unmount();
  });

  it('reports current asset failures and ignores a stale failure after a newer source succeeds', async () => {
    let rejectStale!: (reason: Error) => void;
    renderer.loadScreenshotAssets
      .mockImplementationOnce(
        () =>
          new Promise<ScreenshotRenderAssets>((_resolve, reject) => {
            rejectStale = reject;
          }),
      )
      .mockResolvedValueOnce(assets)
      .mockRejectedValueOnce(new Error('Background asset failed'));
    const wrapper = mountCanvas();
    measurement.set?.(800, 600);
    await wrapper.setProps({
      source: 'project-media://screenshot/screen-2/source.png',
    });
    await flushPromises();
    rejectStale(new Error('Old source failed'));
    await flushPromises();

    expect(wrapper.emitted('error')).toBeUndefined();
    expect(renderer.drawScreenshot).toHaveBeenCalledOnce();

    const changedState = stateFixture();
    changedState.canvas.watermark = {
      ...changedState.canvas.watermark!,
      enabled: true,
    };
    await wrapper.setProps({ state: changedState });
    await flushPromises();
    expect(wrapper.emitted('error')).toEqual([['Error: Background asset failed']]);
    wrapper.unmount();
  });

  it('does not emit a late asset error after unmount', async () => {
    let rejectLate!: (reason: Error) => void;
    renderer.loadScreenshotAssets.mockImplementationOnce(
      () =>
        new Promise<ScreenshotRenderAssets>((_resolve, reject) => {
          rejectLate = reject;
        }),
    );
    const wrapper = mountCanvas();
    await flushPromises();
    wrapper.unmount();
    rejectLate(new Error('Too late'));
    await flushPromises();

    expect(wrapper.emitted('error')).toBeUndefined();
  });
});
