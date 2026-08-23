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
  const beginSelectionMove = vi.fn();
  const moveSelection = vi.fn();
  const endSelectionMove = vi.fn();
  const options: EditorCanvasPointerOptions = {
    canvas: () => null,
    container: () => null,
    isCropping: () => false,
    isManualZoom: () => manualZoom,
    selectedClipId: () => null,
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
      clipIdAt: vi.fn(() => null),
      beginTransformDrag: vi.fn(),
      commitCrop: vi.fn(),
    },
    cursorInteraction: { selectAt: vi.fn(() => false) },
    onSelectClip: vi.fn(),
    onDoneCrop: vi.fn(),
  };

  return {
    interactions: useEditorCanvasPointerInteractions(options),
    isPanning,
    beginPan,
    movePan,
    endPan,
    selectVisualAt,
    beginSelectionMove,
    moveSelection,
    endSelectionMove,
  };
};

describe('useEditorCanvasPointerInteractions', () => {
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
});
