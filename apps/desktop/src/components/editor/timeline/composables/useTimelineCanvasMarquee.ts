import type { TimelineFrameQueue } from '@beam/runtime/timeline/frame-queue-types';
import { onMounted, onScopeDispose } from 'vue';
import type { Ref } from 'vue';
import type { TimelineCanvasLaneProps } from '../timeline-canvas-types';
import type { TimelineCanvasMarquee } from '@beam/runtime/timeline/timeline-canvas-types';
import { timelineCanvasSpan } from '@beam/runtime/timeline/timeline-canvas-paint';

/** One bounded hover animation per visible lane; no clock runs for idle or offscreen items. */
export function useTimelineCanvasMarquee(
  surface: Ref<HTMLElement | null>,
  props: TimelineCanvasLaneProps,
  draw: () => void,
  context: () => CanvasRenderingContext2D | null,
  frames: TimelineFrameQueue,
) {
  let parent: HTMLElement | null = null,
    frame = 0,
    timer = 0;
  let state: TimelineCanvasMarquee | undefined;
  const idAt = (target: EventTarget | null) => {
    const button =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-timeline-clip-id], [data-timeline-zoom-id]')
        : null;
    return button?.dataset.timelineClipId ?? button?.dataset.timelineZoomId;
  };
  const stop = () => {
    window.clearTimeout(timer);
    frames.cancel(frame);
    frame = timer = 0;
    if (state) {
      state = undefined;
      draw();
    }
  };
  const enter = (event: PointerEvent) => {
    const id = idAt(event.target);
    if (!id || id === state?.id || props.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    stop();
    state = { id, offset: 0 };
    timer = window.setTimeout(() => {
      const item = props.items.find(
        (item) => ('clip' in item ? item.clip.id : 'zoom' in item ? item.zoom.id : `canvas-${item.edge}`) === id,
      );
      const ctx = context();
      if (!item || !ctx || 'transition' in item) return;
      const clip = 'clip' in item ? item.clip : null,
        zoom = 'zoom' in item ? item.zoom : null;
      const span = timelineCanvasSpan(
        clip?.timelineStartMs ?? zoom!.startMs,
        clip?.timelineDurationMs ?? zoom!.endMs - zoom!.startMs,
        props.durationMs,
        props.width,
        props.viewport.left,
      );
      const label = item.label ?? ((clip && 'text' in clip ? clip.text?.content.trim() : '') || clip?.name || '');
      const distance = ctx.measureText(label).width - Math.max(1, span.width - 16 - (item.labelInset ?? 0));
      if (distance <= 0) return;
      const start = performance.now(),
        duration = Math.max(3000, (distance / 36) * 1000);
      const tick = (now: number) => {
        if (!state || state.id !== id) return;
        const phase = ((now - start) % (duration * 2)) / duration;
        state.offset = distance * (phase <= 1 ? phase : 2 - phase);
        draw();
        frame = frames.request('measure', tick);
      };
      frame = frames.request('measure', tick);
    }, 250);
  };
  const leave = (event: PointerEvent) => {
    if (idAt(event.relatedTarget) !== state?.id) stop();
  };
  onMounted(() => {
    parent = surface.value?.parentElement ?? null;
    parent?.addEventListener('pointerover', enter);
    parent?.addEventListener('pointerout', leave);
    parent?.addEventListener('pointerdown', stop);
  });
  onScopeDispose(() => {
    stop();
    parent?.removeEventListener('pointerover', enter);
    parent?.removeEventListener('pointerout', leave);
    parent?.removeEventListener('pointerdown', stop);
  });
  return () => state;
}
