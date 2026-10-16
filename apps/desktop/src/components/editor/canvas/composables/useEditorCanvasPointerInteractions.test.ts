import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useEditorCanvasPointerInteractions } from './useEditorCanvasPointerInteractions';
import type { EditorCanvasPointerOptions } from '../editor-canvas-pointer-types';

const pointer = (overrides: Partial<PointerEvent> = {}) =>
  ({
    button: 0,
    pointerId: 1,
    clientX: 120,
    clientY: 80,
    currentTarget: null,
    target: null,
    ...overrides,
  }) as unknown as PointerEvent;

const createHarness = (manualZoom = true) => {
  const isPanning = ref(false);
  const beginPan = vi.fn(() => false);
  const movePan = vi.fn();
  const endPan = vi.fn();
  const selectVisualAt = vi.fn(() => true);
  const clipIdAt = vi.fn(() => null as string | null);
  const onToggleClip = vi.fn();
  const selectedClipId = ref<string | null>(null);
  const beginSelectionMove = vi.fn();
  const moveSelection = vi.fn();
  const endSelectionMove = vi.fn();
  const options: EditorCanvasPointerOptions = {
    canvas: () => null,
    container: () => null,
    isCropping: () => false,
    isManualZoom: () => manualZoom,
    selectedClipId: () => selectedClipId.value,
    viewportZoom: {
      isPanning,
      beginPan,
      movePan,
      endPan,
      handleWheel: vi.fn(),
    },
    cameraZoom: {
      beginSelectionMove,
      moveSelection,
      endSelectionMove,
    },
    transformAndCrop: {
      selectVisualAt,
      clipIdAt,
      beginSelectedTransformDrag: vi.fn(() => false),
      moveSelectedTransformDrag: vi.fn(() => false),
      endSelectedTransformDrag: vi.fn(() => false),
      beginTransformDrag: vi.fn(),
      commitCrop: vi.fn(),
    },
    cursorInteraction: { selectAt: vi.fn(() => false) },
    onSelectClip: vi.fn(),
    onToggleClip,
    onDoneCrop: vi.fn(),
  };

  return {
    interactions: useEditorCanvasPointerInteractions(options),
    isPanning,
    beginPan,
    movePan,
    endPan,
    selectVisualAt,
    clipIdAt,
    onToggleClip,
    selectedClipId,
    options,
    beginSelectionMove,
    moveSelection,
    endSelectionMove,
  };
};

describe('useEditorCanvasPointerInteractions', () => {
  it.each([
    'canvas-playback-error',
    'caption-text-editor',
    'canvas-recenter-float',
    'element-overlay',
    'cursor-canvas-selection',
  ])('leaves %s controls outside cursor hit-testing', (className) => {
    const harness = createHarness(false);
    const container = document.createElement('div');
    container.className = className;
    const button = document.createElement('button');
    container.append(button);
    harness.interactions.handleIslandPointerDownCapture(pointer({ target: button }));
    expect(harness.options.cursorInteraction.selectAt).not.toHaveBeenCalled();
  });

  it('captures cursor selection on the canvas while leaving crop mode alone', () => {
    const harness = createHarness(false);
    const event = pointer({ stopPropagation: vi.fn() });
    vi.mocked(harness.options.cursorInteraction.selectAt).mockReturnValue(true);
    harness.interactions.handleIslandPointerDownCapture(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    harness.options.isCropping = () => true;
    harness.interactions.handleIslandPointerDownCapture(event);
    expect(harness.options.cursorInteraction.selectAt).toHaveBeenCalledOnce();
  });
  it('keeps manual focus ahead of cursor selection in the capture phase', () => {
    const harness = createHarness(true);
    const event = pointer({ stopPropagation: vi.fn() });
    vi.mocked(harness.options.cursorInteraction.selectAt).mockReturnValue(true);
    harness.interactions.handleIslandPointerDownCapture(event);
    harness.interactions.handleIslandPointerDown(event);
    expect(harness.options.cursorInteraction.selectAt).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(harness.beginSelectionMove).toHaveBeenCalledWith(event);
  });

  it('forwards a Manual Zoom pointerdown to camera zoom without raycasting composited media first', () => {
    const harness = createHarness(true);

    harness.interactions.handleIslandPointerDown(pointer());

    expect(harness.selectVisualAt).not.toHaveBeenCalled();
    expect(harness.beginSelectionMove).toHaveBeenCalledOnce();
  });

  it('keeps a successful viewport pan ahead of camera zoom', () => {
    const harness = createHarness(true);
    harness.beginPan.mockReturnValue(true);

    harness.interactions.handleIslandPointerDown(pointer());

    expect(harness.beginPan).toHaveBeenCalledOnce();
    expect(harness.beginSelectionMove).not.toHaveBeenCalled();
    expect(harness.selectVisualAt).not.toHaveBeenCalled();
  });

  it('routes move and up events to camera zoom when the viewport is not panning', () => {
    const harness = createHarness(true);
    const move = pointer({ clientX: 180, clientY: 120 });
    const up = pointer({ clientX: 180, clientY: 120 });

    harness.interactions.handleIslandPointerMove(move);
    harness.interactions.handleIslandPointerUp(up);

    expect(harness.moveSelection).toHaveBeenCalledWith(move);
    expect(harness.endSelectionMove).toHaveBeenCalledWith(up);
    expect(harness.movePan).not.toHaveBeenCalled();
    expect(harness.endPan).not.toHaveBeenCalled();
  });

  it('routes move and up events to the viewport while a pan is active', () => {
    const harness = createHarness(true);
    harness.isPanning.value = true;
    const move = pointer({ clientX: 180, clientY: 120 });
    const up = pointer({ clientX: 180, clientY: 120 });

    harness.interactions.handleIslandPointerMove(move);
    harness.interactions.handleIslandPointerUp(up);

    expect(harness.movePan).toHaveBeenCalledWith(move);
    expect(harness.endPan).toHaveBeenCalledWith(up, null);
    expect(harness.moveSelection).not.toHaveBeenCalled();
    expect(harness.endSelectionMove).not.toHaveBeenCalled();
  });

  it('preserves composited-media raycast selection outside Manual Zoom', () => {
    const harness = createHarness(false);

    harness.interactions.handleIslandPointerDown(pointer());

    expect(harness.selectVisualAt).toHaveBeenCalledOnce();
    expect(harness.beginSelectionMove).not.toHaveBeenCalled();
  });

  it('toggles a transform handle target when a selection modifier is held', () => {
    const harness = createHarness(false);
    harness.selectedClipId.value = 'image';
    const event = pointer({ ctrlKey: true, stopPropagation: vi.fn() });

    harness.interactions.handleTransformPointerDown(event);

    expect(harness.onToggleClip).toHaveBeenCalledWith('image', event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
});

describe('canvas pointer routing boundaries', () => {
  it('leaves an owned transform gesture ahead of canvas panning and camera focus', () => {
    const h = createHarness(false);
    vi.mocked(h.options.transformAndCrop.beginSelectedTransformDrag).mockReturnValue(true);
    h.interactions.handleIslandPointerDown(pointer());
    expect(h.selectVisualAt).not.toHaveBeenCalled();
    expect(h.beginPan).not.toHaveBeenCalled();
    expect(h.beginSelectionMove).not.toHaveBeenCalled();
    vi.mocked(h.options.transformAndCrop.moveSelectedTransformDrag).mockReturnValue(true);
    vi.mocked(h.options.transformAndCrop.endSelectedTransformDrag).mockReturnValue(true);
    h.interactions.handleIslandPointerMove(pointer());
    h.interactions.handleIslandPointerUp(pointer());
    expect(h.moveSelection).not.toHaveBeenCalled();
    expect(h.endSelectionMove).not.toHaveBeenCalled();
  });

  it('selects another clip from its handle before starting a transform', () => {
    const h = createHarness(false);
    h.selectedClipId.value = 'old';
    h.clipIdAt.mockReturnValue('new');
    const event = pointer({ stopPropagation: vi.fn() });
    h.interactions.handleTransformPointerDown(event);
    expect(h.options.onSelectClip).toHaveBeenCalledWith('new');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(h.options.transformAndCrop.beginTransformDrag).not.toHaveBeenCalled();
  });

  it('starts a regular handle move when the current clip is already selected or no clip is hit', () => {
    const h = createHarness(false);
    h.selectedClipId.value = 'same';
    h.clipIdAt.mockReturnValue('same');
    const event = pointer();
    h.interactions.handleTransformPointerDown(event);
    expect(h.options.transformAndCrop.beginTransformDrag).toHaveBeenCalledWith(event, 'move');
    h.clipIdAt.mockReturnValue(null);
    h.selectedClipId.value = null;
    h.interactions.handleTransformPointerDown(event);
    h.interactions.handleTransformPointerDown(pointer({ button: 2 }));
    expect(h.options.onSelectClip).not.toHaveBeenCalled();
    expect(h.options.onToggleClip).not.toHaveBeenCalled();
  });

  it('does not raycast a right press as a visual selection', () => {
    const h = createHarness(false);
    const event = pointer({ button: 2 });
    h.interactions.handleIslandPointerDown(event);
    expect(h.selectVisualAt).not.toHaveBeenCalled();
    expect(h.beginSelectionMove).toHaveBeenCalledWith(event);
  });

  it('forwards wheel geometry and crop completion through their owning controllers', () => {
    const h = createHarness();
    const event = new WheelEvent('wheel');
    h.interactions.handleIslandWheel(event);
    expect(h.options.viewportZoom.handleWheel).toHaveBeenCalledWith(event, undefined);
    const container = document.createElement('div');
    h.options.container = () => container;
    h.interactions.handleIslandWheel(event);
    expect(h.options.viewportZoom.handleWheel).toHaveBeenLastCalledWith(event, container.getBoundingClientRect());
    h.interactions.commitCrop();
    expect(h.options.transformAndCrop.commitCrop).toHaveBeenCalledOnce();
    expect(h.options.onDoneCrop).toHaveBeenCalledOnce();
  });
});
