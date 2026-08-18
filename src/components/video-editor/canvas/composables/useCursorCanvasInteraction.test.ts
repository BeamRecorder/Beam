import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CursorCanvasBounds } from '../../properties/cursor/cursor-rendering';
import { useCursorCanvasInteraction } from './useCursorCanvasInteraction';

const canvas = (width = 800, height = 450) => {
  const element = document.createElement('canvas');
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: 50,
    left: 100,
    top: 50,
    right: 100 + width,
    bottom: 50 + height,
    width,
    height,
    toJSON: () => ({}),
  });
  return element;
};

const pointer = (clientX: number, clientY: number, button = 0, pointerId = 1, buttons = 1) =>
  ({ clientX, clientY, button, pointerId, buttons }) as unknown as PointerEvent;

const bounds = (overrides: Partial<CursorCanvasBounds> = {}): CursorCanvasBounds => ({
  x: 200,
  y: 100,
  width: 40,
  height: 20,
  hotspot: { x: 220, y: 110 },
  ...overrides,
});

const createInteraction = (overrides: Partial<Parameters<typeof useCursorCanvasInteraction>[0]> = {}) => {
  const currentBounds = ref<CursorCanvasBounds | null>(bounds());
  const isPlaying = ref(false);
  const canResize = ref(true);
  const onSelect = vi.fn();
  const onResize = vi.fn();
  const target = canvas();
  const interaction = useCursorCanvasInteraction({
    bounds: currentBounds,
    canvas: () => target,
    cursorSize: () => 24,
    isPlaying: () => isPlaying.value,
    canResize: () => canResize.value,
    onSelect,
    onResize,
    ...overrides,
  });
  return { interaction, currentBounds, isPlaying, canResize, onSelect, onResize, target };
};

describe('useCursorCanvasInteraction', () => {
  it('hit-tests the cursor bounds, including the selection padding, and ignores non-primary clicks', () => {
    const { interaction, onSelect } = createInteraction();

    expect(interaction.selectAt(pointer(300, 150))).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();

    // The six logical pixels of tolerance also make the hotspot edge clickable.
    expect(interaction.selectAt(pointer(294, 150))).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(interaction.selectAt(pointer(293, 150))).toBe(false);
    expect(interaction.selectAt(pointer(300, 150, 2))).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('uses the canvas-to-layout scale when hit-testing a high-DPI canvas', () => {
    const currentBounds = ref(bounds({ x: 400, y: 200, width: 40, height: 20 }));
    const target = canvas(400, 225);
    Object.defineProperty(target, 'width', { configurable: true, value: 800 });
    Object.defineProperty(target, 'height', { configurable: true, value: 450 });
    target.getBoundingClientRect = vi.fn(() => ({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 900,
      bottom: 500,
      width: 800,
      height: 450,
      toJSON: () => ({}),
    }));
    const onSelect = vi.fn();
    const interaction = useCursorCanvasInteraction({
      bounds: currentBounds,
      canvas: () => target,
      cursorSize: () => 24,
      isPlaying: () => false,
      canResize: () => true,
      onSelect,
      onResize: vi.fn(),
    });

    // Layout coordinates are converted to backing-canvas coordinates by the same scale as rendering.
    expect(interaction.selectAt(pointer(900, 450))).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('does not select or resize when bounds are missing or playback is active', async () => {
    const { interaction, currentBounds, isPlaying, onSelect, onResize } = createInteraction();
    currentBounds.value = null;
    expect(interaction.selectAt(pointer(300, 150))).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();

    currentBounds.value = bounds();
    isPlaying.value = true;
    await nextTick();
    interaction.beginResize('top-left', pointer(320, 160));
    interaction.moveResize(pointer(340, 180));
    expect(interaction.resizing.value).toBe(false);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('resizes from a corner and clamps the slider value to 16–128', () => {
    const { interaction, onResize } = createInteraction();

    interaction.beginResize('top-left', pointer(340, 180));
    expect(interaction.resizing.value).toBe(true);
    interaction.moveResize(pointer(300, 160));
    expect(onResize).toHaveBeenLastCalledWith(48);
    interaction.endResize();
    expect(interaction.resizing.value).toBe(false);

    interaction.beginResize('top-left', pointer(340, 180));
    interaction.moveResize(pointer(800, 450));
    expect(onResize).toHaveBeenLastCalledWith(16);
    interaction.endResize();

    interaction.beginResize('top-left', pointer(340, 180));
    interaction.moveResize(pointer(0, 0));
    expect(onResize).toHaveBeenLastCalledWith(128);
  });

  it('changes size progressively from a corner in both directions', () => {
    const growing = createInteraction();
    growing.interaction.beginResize('top-left', pointer(340, 180));
    growing.interaction.moveResize(pointer(320, 170));
    growing.interaction.moveResize(pointer(300, 160));
    expect(growing.onResize.mock.calls.map(([size]) => size)).toEqual([36, 48]);

    const shrinking = createInteraction();
    shrinking.interaction.beginResize('top-left', pointer(340, 180));
    shrinking.interaction.moveResize(pointer(350, 185));
    shrinking.interaction.moveResize(pointer(360, 190));
    expect(shrinking.onResize.mock.calls.map(([size]) => size)).toEqual([18, 16]);
  });

  it.each([
    ['top-left', [340, 180], [320, 170]],
    ['top-right', [380, 180], [400, 170]],
    ['bottom-right', [380, 200], [400, 210]],
    ['bottom-left', [340, 200], [320, 210]],
  ] as const)('resizes symmetrically from the %s corner', (corner, start, move) => {
    const { interaction, onResize } = createInteraction();
    interaction.beginResize(corner, pointer(start[0], start[1]));
    interaction.moveResize(pointer(move[0], move[1]));
    expect(onResize).toHaveBeenLastCalledWith(36);
  });

  it('does not bounce when the pointer crosses the cursor anchor', () => {
    const { interaction, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(340, 180));
    interaction.moveResize(pointer(360, 190));
    interaction.moveResize(pointer(400, 210));

    expect(onResize.mock.calls.map(([size]) => size)).toEqual([16, 16]);
  });

  it('keeps size unchanged for a pure vertical corner movement', () => {
    const { interaction, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(340, 180));
    interaction.moveResize(pointer(340, 200));

    expect(onResize).toHaveBeenLastCalledWith(24);
  });

  it('anchors resize speed to the selected bounds, not the cursor hotspot', () => {
    const first = createInteraction();
    first.interaction.beginResize('top-left', pointer(340, 180));
    first.interaction.moveResize(pointer(300, 160));

    const second = createInteraction();
    second.currentBounds.value = bounds({ hotspot: { x: 999, y: 999 } });
    second.interaction.beginResize('top-left', pointer(340, 180));
    second.interaction.moveResize(pointer(300, 160));

    expect(first.onResize).toHaveBeenLastCalledWith(48);
    expect(second.onResize).toHaveBeenLastCalledWith(48);
  });

  it('cancels an in-progress resize when playback starts', async () => {
    const { interaction, isPlaying, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(240, 130));
    expect(interaction.resizing.value).toBe(true);

    isPlaying.value = true;
    await nextTick();
    interaction.moveResize(pointer(260, 150));

    expect(interaction.resizing.value).toBe(false);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('locks movement to the initiating pointer and ends when no buttons remain pressed', () => {
    const { interaction, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(340, 180, 0, 7));

    interaction.moveResize(pointer(300, 160, 0, 8));
    expect(onResize).not.toHaveBeenCalled();
    expect(interaction.resizing.value).toBe(true);

    interaction.moveResize(pointer(300, 160, 0, 7, 0));
    expect(interaction.resizing.value).toBe(false);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('cancels the active resize when the selection bounds disappear', () => {
    const { interaction, currentBounds, canResize, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(340, 180));
    expect(interaction.resizing.value).toBe(true);

    canResize.value = false;
    currentBounds.value = null;
    interaction.moveResize(pointer(300, 160));

    expect(interaction.resizing.value).toBe(false);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('cancels and blocks a resize while the selection is disabled, then allows a fresh gesture', async () => {
    const { interaction, canResize, onResize } = createInteraction();
    interaction.beginResize('top-left', pointer(340, 180));
    expect(interaction.resizing.value).toBe(true);

    canResize.value = false;
    await nextTick();
    interaction.moveResize(pointer(300, 160));
    expect(interaction.resizing.value).toBe(false);
    expect(onResize).not.toHaveBeenCalled();

    canResize.value = true;
    await nextTick();
    interaction.beginResize('top-left', pointer(340, 180));
    interaction.moveResize(pointer(300, 160));
    expect(onResize).toHaveBeenLastCalledWith(48);
  });
});
