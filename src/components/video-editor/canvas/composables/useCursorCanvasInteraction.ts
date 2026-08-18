import { ref, watch, type Ref } from 'vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { clampCursorSize } from '../../properties/cursor/cursor-size';
import type { CursorCanvasBounds } from '../../properties/cursor/cursor-rendering';

interface CursorCanvasInteractionOptions {
  bounds: Ref<CursorCanvasBounds | null>;
  canvas: () => HTMLCanvasElement | null;
  cursorSize: () => number;
  isPlaying: () => boolean;
  canResize: () => boolean;
  onSelect: () => void;
  onResize: (size: number) => void;
}

interface ResizeStart {
  size: number;
  pointerId: number;
  pointer: { x: number; y: number };
  width: number;
  horizontalDirection: -1 | 1;
}

const pointerInCanvas = (event: PointerEvent, canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / Math.max(1, canvas.clientWidth);
  return {
    x: (event.clientX - rect.left) / Math.max(scale, Number.EPSILON),
    y: (event.clientY - rect.top) / Math.max(scale, Number.EPSILON),
    scale,
  };
};

export function useCursorCanvasInteraction(options: CursorCanvasInteractionOptions) {
  const resizing = ref(false);
  let resizeStart: ResizeStart | null = null;

  const selectAt = (event: PointerEvent) => {
    const canvas = options.canvas();
    const bounds = options.bounds.value;
    if (event.button !== 0 || !canvas || !bounds) return false;
    const point = pointerInCanvas(event, canvas);
    const padding = 6 / Math.max(point.scale, Number.EPSILON);
    const hit =
      point.x >= bounds.x - padding &&
      point.x <= bounds.x + bounds.width + padding &&
      point.y >= bounds.y - padding &&
      point.y <= bounds.y + bounds.height + padding;
    if (hit) options.onSelect();
    return hit;
  };

  const beginResize = (corner: ResizeCorner, event: PointerEvent) => {
    const canvas = options.canvas();
    const bounds = options.bounds.value;
    if (options.isPlaying() || !options.canResize() || !canvas || !bounds) return;
    const point = pointerInCanvas(event, canvas);
    resizeStart = {
      size: options.cursorSize(),
      pointerId: event.pointerId,
      pointer: point,
      width: bounds.width,
      horizontalDirection: corner.endsWith('left') ? -1 : 1,
    };
    resizing.value = true;
  };

  const moveResize = (event: PointerEvent) => {
    const canvas = options.canvas();
    if (!resizeStart || !canvas) return;
    if (options.isPlaying() || !options.canResize() || event.buttons === 0) {
      endResize();
      return;
    }
    if (event.pointerId !== resizeStart.pointerId) return;
    const point = pointerInCanvas(event, canvas);
    const deltaX = point.x - resizeStart.pointer.x;
    const ratio = 1 + (resizeStart.horizontalDirection * deltaX) / Math.max(1, resizeStart.width);
    options.onResize(clampCursorSize(resizeStart.size * ratio));
  };

  const endResize = () => {
    resizeStart = null;
    resizing.value = false;
  };

  watch(
    () => [options.isPlaying(), options.canResize()] as const,
    ([playing, canResize]) => (playing || !canResize) && endResize(),
  );

  return { resizing, selectAt, beginResize, moveResize, endResize };
}
