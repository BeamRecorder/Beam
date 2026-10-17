import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import EditorCanvas from '../EditorCanvas.vue';
import EditorCanvasLayerSelection from '../EditorCanvasLayerSelection.vue';
import CanvasCropSelection from '../CanvasCropSelection.vue';
import CanvasLayerSelection from '../CanvasLayerSelection.vue';
import type { EditorCanvasProps } from '../editor-canvas-types';
import { context, snapshot } from '@beam/runtime/rendering/tests/render.test-support';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { triggerPointer } from '../../../../../../../tests/support/pointer';
import { MACOS_CURSOR_PACK } from '../../properties/cursor/cursor-packs';

const paint = vi.hoisted(() => vi.fn());
vi.mock('@beam/runtime/rendering/render', () => ({
  renderCompositionFrame: paint,
  disposeCompositionRenderer: vi.fn(),
}));
vi.mock('../../resources/editor-image-cache', () => ({
  requestEditorImage: () => {
    const image = document.createElement('img');
    return { image, ready: Promise.resolve(image) };
  },
}));
vi.mock('../../properties/cursor/useCursorReplacer', () => ({
  useCursorReplacer: () => ({
    getCursorImage: () => Promise.resolve({ complete: true, naturalWidth: 32 } as HTMLImageElement),
  }),
}));
let wrapper: VueWrapper | undefined;
let frames: FrameRequestCallback[];
const rectangle = { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450, toJSON() {} };
beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const ctx = Object.assign(context(), {
    canvas: { width: 800, height: 450 },
    getImageData: () => ({ data: new Uint8ClampedArray(64 * 64 * 4) }),
    resetTransform: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rectangle);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(450);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return ctx;
      }
    },
  );
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountCanvas(extra: Partial<EditorCanvasProps> = {}) {
  const value = snapshot(),
    cursor = value.cursorSettings;
  const screen = value.composition.clips[0]!;
  if (extra.isCropping && screen.kind === 'screen') screen.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const props: EditorCanvasProps = {
    isPlaying: false,
    currentTime: 0.5,
    duration: 1,
    composition: value.composition,
    outputCanvas: value.canvas,
    cursorSelection: cursor.selection,
    cursorPack: MACOS_CURSOR_PACK,
    cursorSize: cursor.size,
    cursorColor: cursor.color,
    enableShadow: true,
    shadowBlur: 4,
    shadowColor: '#000',
    shadowDirection: 'bottom',
    clickEffects: cursor.clickEffects,
    motion: cursor.motion,
    autoHide: cursor.autoHide,
    selectedBackground: null,
    frameFor: () => ({
      bitmap: {} as ImageBitmap,
      clipId: 'screen',
      timestampSeconds: 0.5,
      durationSeconds: 1,
      width: 100,
      height: 50,
      byteSize: 20000,
      close() {},
    }),
    frameVersion: 1,
    previewQuality: 'full',
    playbackState: 'paused',
    playbackError: null,
    zoomElements: [],
    selectedZoom: null,
    activeTab: 'canvas',
    selectedTransformClip: screen.kind === 'screen' ? screen : null,
    selectedClipIds: ['screen'],
    editorData: {
      cursor: {
        ...value.cursor,
        available: true,
        events: [
          { event: 'move', sessionNs: 0, pixelX: 50, pixelY: 25, normalizedX: 0.5, normalizedY: 0.5, visible: true },
        ],
      },
    } as NonNullable<EditorCanvasProps['editorData']>,
    ...extra,
  };
  wrapper = mount(EditorCanvas, { props });
  return wrapper;
}
async function tick() {
  await nextTick();
  for (let i = 0; i < 3; i++) {
    frames.shift()?.(performance.now());
    await nextTick();
  }
}
function pointer(type: string, x: number, y: number) {
  const event = Object.assign(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }), {
    pointerId: 1,
  });
  const target = document.createElement('div');
  target.setPointerCapture = vi.fn();
  target.releasePointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  Object.defineProperty(event, 'currentTarget', { value: target });
  return event;
}

it('renders real geometry and keeps drag commits, selection and painted centers connected', async () => {
  const mounted = mountCanvas();
  await tick();
  const selection = mounted.findComponent(EditorCanvasLayerSelection);
  const handles = mounted.findComponent(CanvasLayerSelection);
  handles.vm.$emit('pointer-down', pointer('pointerdown', 400, 225));
  handles.vm.$emit('pointer-move', pointer('pointermove', 430, 245));
  handles.vm.$emit('pointer-up', pointer('pointerup', 430, 245));
  await tick();
  expect(mounted.emitted('update:clip-transform')?.length).toBeGreaterThan(0);
  expect(paint).toHaveBeenCalled();
  const evaluation = paint.mock.lastCall![10];
  expect(evaluation.camera.scale).toBe(1);
  expect(evaluation.cursorMotion).toMatchObject({ x: 0.5, y: 0.5 });
  selection.vm.$emit('rotate', 15);
  selection.vm.$emit('rotate-end', 15);
  expect(mounted.emitted('preview:clip-rotation')?.[0]).toEqual([15]);
  expect(mounted.emitted('update:clip-rotation')?.[0]).toEqual([15]);
});

it('keeps manual focus active over consecutive real drag adjustments', async () => {
  const zoom = {
    id: 'manual',
    sessionId: '',
    startMs: 0,
    endMs: 1000,
    depth: 2 as const,
    mode: 'manual' as const,
    focus: { cx: 0.5, cy: 0.5 },
  };
  const mounted = mountCanvas({ selectedZoom: zoom, zoomElements: [zoom] });
  await tick();
  const island = mounted.find('.canvas-island');
  for (let i = 0; i < 2; i++) {
    await triggerPointer(island, 'pointerdown', { clientX: 400, clientY: 225 });
    await triggerPointer(island, 'pointermove', { clientX: 420, clientY: 230 });
    await triggerPointer(island, 'pointerup', { clientX: 420, clientY: 230 });
  }
  expect(mounted.emitted('update:zoom')).toHaveLength(2);
  expect(mounted.emitted('deselect:zoom')).toBeUndefined();
});

it('commits crop interactions and continues to use the prepared preview while resizing', async () => {
  const mounted = mountCanvas({ isCropping: true });
  await tick();
  const crop = mounted.findComponent(CanvasCropSelection);
  crop.vm.$emit('move-start', pointer('pointerdown', 400, 225));
  crop.vm.$emit('move', pointer('pointermove', 415, 230));
  crop.vm.$emit('move-end', pointer('pointerup', 415, 230));
  crop.vm.$emit('done');
  await tick();
  expect(mounted.emitted('update:clip-crop')?.length).toBeGreaterThan(0);
  expect(mounted.emitted('done:crop')).toHaveLength(1);
  crop.vm.$emit('resize-start', 'bottom-right', pointer('pointerdown', 700, 400));
  crop.vm.$emit('resize-move', pointer('pointermove', 690, 390));
  crop.vm.$emit('resize-end', pointer('pointerup', 690, 390));
  await mounted.setProps({ previewQuality: 'half', currentTime: 0.6 });
  await tick();
  expect(paint.mock.lastCall![3]).toBe(0.6);
});

it('keeps caption editing on the actual layer and restores the rendered text after finishing', async () => {
  const value = snapshot();
  const caption = {
    id: 'caption',
    kind: 'caption' as const,
    name: 'Caption',
    enabled: true,
    order: 2,
    timelineStartMs: 0,
    timelineDurationMs: 1000,
    sourceInMs: 0,
    sourceDurationMs: 1000,
    playbackRate: 1,
    transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    caption: {
      type: 'text' as const,
      sentences: [],
      style: { ...createDefaultCaptionStyle(12), customText: 'Hello', wrap: true },
    },
  };
  value.composition.clips.push(caption);
  const mounted = mountCanvas({
    composition: value.composition,
    selectedTransformClip: caption,
    selectedClipIds: [caption.id],
  });
  await tick();
  await mounted.find('.canvas-island').trigger('dblclick', { clientX: 400, clientY: 200, button: 0 });
  await tick();
  const editor = mounted.find('textarea');
  expect(editor.exists()).toBe(true);
  await editor.setValue('Updated caption');
  await editor.trigger('keydown', { key: 'Enter', ctrlKey: true });
  await mounted.setProps({ isPlaying: true });
  await tick();
  expect(mounted.emitted('caption-editing-start')).toHaveLength(1);
  expect(mounted.emitted('update:caption-text')?.at(-1)?.[0]).toMatchObject({
    clipId: caption.id,
    customText: 'Updated caption',
  });
});
