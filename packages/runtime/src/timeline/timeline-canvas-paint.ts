import type {
  TimelineCanvasItem,
  TimelineCanvasPalette,
  TimelineCanvasMarquee,
  TimelineCanvasGeometry,
  TimelineLabelContrast,
} from '@beam/runtime/timeline/timeline-canvas-types';
import type { TimelineCanvasArtwork } from '@beam/runtime/timeline/timeline-canvas-types';
import { paintTimelineArtwork } from './timeline-canvas-artwork';
import { paintTimelineTransition } from './timeline-canvas-transition';
import { timelineCanvasSpan } from './timeline-canvas-layout';
import { paintTimelineLabels } from './timeline-canvas-labels';
const emptyArtworks: ReadonlyMap<string, TimelineCanvasArtwork> = new Map();

export { timelineCanvasSpan } from './timeline-canvas-layout';

export function paintTimelineBodies(
  ctx: CanvasRenderingContext2D,
  items: readonly TimelineCanvasItem[],
  geometry: TimelineCanvasGeometry,
  palette: TimelineCanvasPalette,
  artworks: ReadonlyMap<string, TimelineCanvasArtwork> = emptyArtworks,
): void {
  ctx.clearRect(0, 0, geometry.viewportWidth, geometry.height);
  ctx.font = '500 9px system-ui';
  ctx.textBaseline = 'middle';
  for (const item of items) {
    const clip = 'clip' in item ? item.clip : null,
      zoom = 'zoom' in item ? item.zoom : null,
      canvasTransition = 'transition' in item ? item : null;
    const duration =
      clip?.timelineDurationMs ?? (zoom ? zoom.endMs - zoom.startMs : canvasTransition!.transition.durationMs);
    const start =
      clip?.timelineStartMs ??
      (zoom ? zoom.startMs : canvasTransition!.edge === 'entry' ? 0 : geometry.durationMs - duration);
    const enabled = clip?.enabled ?? true,
      kind = clip?.kind ?? (zoom ? 'zoom' : 'canvas'),
      id = clip?.id ?? zoom?.id ?? `canvas-${canvasTransition!.edge}`;
    const span = timelineCanvasSpan(start, duration, geometry.durationMs, geometry.width, geometry.left);
    if (span.x + span.width < 0 || span.x > geometry.viewportWidth) continue;
    const y = 0,
      height = geometry.height;
    const artwork = artworks.get(id);
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : palette.disabledOpacity;
    ctx.beginPath();
    ctx.roundRect(span.x, y, span.width, height, palette.radius);
    ctx.fillStyle = palette.background;
    ctx.fill();
    ctx.fillStyle =
      kind === 'blur'
        ? clip?.kind === 'blur' && clip.mode === 'highlight'
          ? palette.highlight
          : palette.blur
        : kind === 'canvas'
          ? palette.curve
          : kind === 'audio'
            ? palette.audio
            : kind === 'zoom'
              ? palette.zoom
              : kind === 'caption'
                ? palette.annotation
                : kind === 'shape'
                  ? palette.shape
                  : artwork?.kind === 'image'
                    ? palette.image
                    : palette.video;
    ctx.globalAlpha *= palette.tint;
    ctx.fill();
    ctx.globalAlpha = enabled ? 1 : palette.disabledOpacity;
    ctx.clip();
    if (artwork) paintTimelineArtwork(ctx, artwork, { ...span, y, height }, duration, palette, geometry.viewportWidth);
    if (clip?.locked || zoom?.locked) {
      ctx.save();
      ctx.globalAlpha *= 0.1;
      ctx.strokeStyle = palette.itemText;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (
        let x = Math.max(span.x, -geometry.height);
        x < Math.min(span.x + span.width, geometry.viewportWidth) + geometry.height;
        x += 8
      ) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x - geometry.height, geometry.height);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (canvasTransition)
      paintTimelineTransition(
        ctx,
        canvasTransition.edge,
        canvasTransition.transition,
        { ...span, height: geometry.height },
        palette,
      );
    for (const edge of ['entry', 'exit'] as const) {
      const transition = clip?.transitions?.[edge];
      if (!transition) continue;
      const width = Math.min(span.width, (transition.durationMs / Math.max(1, duration)) * span.width);
      paintTimelineTransition(
        ctx,
        edge,
        transition,
        {
          x: edge === 'entry' ? span.x : span.x + span.width - width,
          width,
          height: geometry.height,
        },
        palette,
      );
    }
    ctx.beginPath();
    const lineWidth = item.selected ? 2 : 1;
    const inset = lineWidth / 2;
    // Stroke inside the body so full-height clips retain their top and bottom borders.
    ctx.roundRect(
      span.x + inset,
      y + inset,
      span.width - lineWidth,
      height - lineWidth,
      Math.max(0, palette.radius - inset),
    );
    ctx.strokeStyle = item.selected || item.pasteHighlight ? palette.selected : palette.border;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }
}

/** Complete portable painter; the desktop shares a body pass before resolving local overlay contrast. */
export function paintTimelineCanvas(
  ctx: CanvasRenderingContext2D,
  items: readonly TimelineCanvasItem[],
  geometry: TimelineCanvasGeometry,
  palette: TimelineCanvasPalette,
  artworks: ReadonlyMap<string, TimelineCanvasArtwork> = emptyArtworks,
  marquee?: TimelineCanvasMarquee,
  contrast?: TimelineLabelContrast,
): void {
  paintTimelineBodies(ctx, items, geometry, palette, artworks);
  paintTimelineLabels(ctx, items, geometry, palette, artworks, marquee, contrast);
}
