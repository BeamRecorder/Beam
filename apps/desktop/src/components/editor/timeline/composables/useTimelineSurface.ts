import type { TimelineFrameQueue } from '@beam/runtime/timeline/frame-queue-types';
import { onMounted, onScopeDispose, provide, ref } from 'vue';
import type { Ref } from 'vue';
import { paintTimelineCanvas } from '@beam/runtime/timeline/timeline-canvas-paint';
import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import { TIMELINE_SURFACE_KEY } from '../timeline-surface-types';
import type { TimelineSurface, TimelineSurfaceLane } from '../timeline-surface-types';
import { timelineSurfacePalette } from '../timeline-surface-palette';

/** One viewport bitmap and one invalidation clock, independent of the number of timeline tracks. */
export function useTimelineSurface(
  scroll: Ref<HTMLDivElement | null>,
  frameQueue: TimelineFrameQueue,
): TimelineSurface {
  const canvas = ref<HTMLCanvasElement | null>(null);
  const lanes = new Set<TimelineSurfaceLane>();
  let disposed = false;
  let frame: number | null = null,
    resize: ResizeObserver | null = null,
    theme: MutationObserver | null = null;
  let palette: ReturnType<typeof timelineSurfacePalette> | undefined;
  const context = () => canvas.value?.getContext('2d') ?? null;
  const draw = () => {
    frame = null;
    const element = canvas.value,
      viewport = scroll.value;
    if (!element || !viewport || !viewport.clientWidth || !viewport.clientHeight) return;
    const ctx = context();
    if (!ctx) throw new Error('Timeline canvas context unavailable.');
    const bounds = viewport.getBoundingClientRect();
    const scale = bounds.width / viewport.offsetWidth || 1;
    const dpr = (window.devicePixelRatio || 1) * scale;
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    if (element.width !== Math.ceil(width * dpr)) element.width = Math.ceil(width * dpr);
    if (element.height !== Math.ceil(height * dpr)) element.height = Math.ceil(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    palette ??= timelineSurfacePalette(element);
    engineMetrics.measure('prepare', () => {
      for (const lane of lanes) {
        const rect = lane.element.getBoundingClientRect();
        const x = (rect.left - bounds.left) / scale,
          y = (rect.top - bounds.top) / scale;
        const laneHeight = rect.height / scale;
        if (y + laneHeight < 0 || y >= height || !lane.props.width) continue;
        const left = Math.max(0, -x),
          paintedWidth = Math.min(lane.props.width - left, width - Math.max(0, x));
        if (paintedWidth <= 0 || laneHeight <= 0) continue;
        ctx.save();
        ctx.translate(Math.max(0, x), y);
        ctx.beginPath();
        ctx.rect(0, 0, paintedWidth, laneHeight);
        ctx.clip();
        paintTimelineCanvas(
          ctx,
          lane.props.items,
          {
            durationMs: lane.props.durationMs,
            width: lane.props.width,
            left,
            viewportWidth: paintedWidth,
            height: laneHeight,
          },
          palette!,
          lane.props.artworks,
          lane.marquee(),
        );
        ctx.restore();
      }
    });
    // Placement and backing pixels belong to the same committed frame.
    element.style.left = `${viewport.scrollLeft}px`;
    element.style.top = `${viewport.scrollTop}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  };
  const invalidate = () => {
    if (!disposed && frame === null) frame = frameQueue.request('paint', draw);
  };
  const surface: TimelineSurface = {
    frames: frameQueue,
    canvas,
    context,
    invalidate,
    register(lane) {
      lanes.add(lane);
      resize?.observe(lane.element);
      invalidate();
      return () => {
        lanes.delete(lane);
        resize?.unobserve(lane.element);
        invalidate();
      };
    },
  };
  provide(TIMELINE_SURFACE_KEY, surface);
  onMounted(() => {
    resize = new ResizeObserver(invalidate);
    if (scroll.value) {
      resize.observe(scroll.value);
      scroll.value.addEventListener('scroll', invalidate, { passive: true });
    }
    for (const lane of lanes) resize.observe(lane.element);
    theme = new MutationObserver(() => {
      palette = undefined;
      invalidate();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    window.addEventListener('resize', invalidate);
    invalidate();
  });
  onScopeDispose(() => {
    disposed = true;
    if (frame !== null) frameQueue.cancel(frame);
    resize?.disconnect();
    theme?.disconnect();
    scroll.value?.removeEventListener('scroll', invalidate);
    window.removeEventListener('resize', invalidate);
    lanes.clear();
  });
  return surface;
}
