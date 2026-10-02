import type {
  TimelineCanvasItem,
  TimelineCanvasPalette,
  TimelineCanvasMarquee,
} from '@beam/runtime/timeline/timeline-canvas-types';
import type { TimelineCanvasArtwork } from '@beam/runtime/timeline/timeline-canvas-types';
import { paintTimelineArtwork } from './timeline-canvas-artwork';
import { paintTimelineTransition } from './timeline-canvas-transition';
const emptyArtworks: ReadonlyMap<string, TimelineCanvasArtwork> = new Map();

/** Geometry is in layout pixels, never the CSS-scaled screenshot coordinates. */
export function timelineCanvasSpan(startMs: number, durationMs: number, duration: number, width: number, left: number) {
  if (![startMs, durationMs, duration, width, left].every(Number.isFinite) || duration <= 0 || width <= 0)
    throw new RangeError('Invalid timeline canvas geometry.');
  return {
    x: (startMs / duration) * width - left,
    width: Math.max(14, (durationMs / duration) * width),
  };
}

export function paintTimelineCanvas(
  ctx: CanvasRenderingContext2D,
  items: readonly TimelineCanvasItem[],
  geometry: {
    durationMs: number;
    width: number;
    left: number;
    viewportWidth: number;
    height: number;
  },
  palette: TimelineCanvasPalette,
  artworks: ReadonlyMap<string, TimelineCanvasArtwork> = emptyArtworks,
  marquee?: TimelineCanvasMarquee,
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
    const effect = kind === 'zoom' || kind === 'caption';
    const y = effect ? palette.effectInset : canvasTransition ? 3 : 2;
    const height = effect ? palette.effectHeight : geometry.height - y * 2;
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
              : ['shape', 'caption'].includes(kind)
                ? palette.annotation
                : palette.video;
    ctx.globalAlpha *= palette.tint;
    ctx.fill();
    ctx.globalAlpha = enabled ? 1 : palette.disabledOpacity;
    ctx.clip();
    const artwork = artworks.get(id);
    if (artwork) paintTimelineArtwork(ctx, artwork, { ...span, y, height }, duration, palette, geometry.viewportWidth);
    if (clip?.locked || zoom?.locked) {
      ctx.save();
      ctx.globalAlpha *= 0.1;
      ctx.strokeStyle = palette.text;
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
    const label = item.label ?? ((clip && 'text' in clip ? clip.text?.content.trim() : '') || clip?.name || '');
    const icons = item.labelInset ?? (clip?.locked || zoom?.locked ? 15 : 0) + (kind === 'blur' ? 15 : 0);
    const labelX = span.x + 8 + icons;
    const labelWidth = Math.max(1, Math.min(span.x + span.width - labelX - 8, geometry.viewportWidth - labelX - 8));
    if (artwork && ['thumbnails', 'shape', 'image', 'color'].includes(artwork.kind)) {
      ctx.fillStyle = palette.labelBackground;
      ctx.fillRect(labelX - 3, 3, Math.min(labelWidth + 6, ctx.measureText(label).width + 8), 13);
    }
    ctx.fillStyle = artwork ? palette.labelText : palette.text;
    ctx.save();
    ctx.beginPath();
    ctx.rect(labelX, y, labelWidth, height);
    ctx.clip();
    ctx.fillText(label, labelX - (marquee?.id === id ? marquee.offset : 0), artwork ? 9 : y + height / 2);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(span.x, y, span.width, height, palette.radius);
    ctx.strokeStyle = item.selected || item.pasteHighlight ? palette.selected : palette.border;
    ctx.lineWidth = item.selected ? 2 : 1;
    ctx.stroke();
    ctx.restore();
  }
}
