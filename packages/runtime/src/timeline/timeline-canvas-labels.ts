import type {
  TimelineCanvasItem,
  TimelineCanvasPalette,
  TimelineCanvasGeometry,
  TimelineCanvasArtwork,
  TimelineCanvasMarquee,
  TimelineLabelContrast,
} from './timeline-canvas-types';
import { timelineCanvasSpan, timelineMetadataInset } from './timeline-canvas-layout';

/** Paint metadata after the host samples the undecorated artwork for local contrast. */
export function paintTimelineLabels(
  ctx: CanvasRenderingContext2D,
  items: readonly TimelineCanvasItem[],
  geometry: TimelineCanvasGeometry,
  palette: TimelineCanvasPalette,
  artworks: ReadonlyMap<string, TimelineCanvasArtwork>,
  marquee?: TimelineCanvasMarquee,
  contrast?: TimelineLabelContrast,
): void {
  ctx.save();
  ctx.font = '500 9px system-ui';
  ctx.textBaseline = 'middle';
  for (const item of items) {
    const clip = 'clip' in item ? item.clip : null;
    const zoom = 'zoom' in item ? item.zoom : null;
    const transition = 'transition' in item ? item : null;
    const duration = clip?.timelineDurationMs ?? (zoom ? zoom.endMs - zoom.startMs : transition!.transition.durationMs);
    const start =
      clip?.timelineStartMs ??
      (zoom ? zoom.startMs : transition!.edge === 'entry' ? 0 : geometry.durationMs - duration);
    const id = clip?.id ?? zoom?.id ?? `canvas-${transition!.edge}`;
    const span = timelineCanvasSpan(start, duration, geometry.durationMs, geometry.width, geometry.left);
    if (span.x + span.width < 0 || span.x > geometry.viewportWidth) continue;
    const artwork = artworks.get(id);
    const label = item.label ?? ((clip && 'text' in clip ? clip.text?.content.trim() : '') || clip?.name || '');
    const icons =
      item.labelInset ??
      timelineMetadataInset(Number(Boolean(clip?.locked || zoom?.locked)) + Number(clip?.kind === 'blur'));
    const labelX = span.x + 8 + icons;
    const width = Math.min(
      span.x + span.width - labelX - (item.labelEndInset ?? 8),
      geometry.viewportWidth - labelX - 8,
    );
    if (!label || width <= 0) continue;
    const y = artwork ? 9 : geometry.height / 2;
    const color = contrast?.(Math.max(0, labelX) + Math.min(width, ctx.measureText(label).width) / 2, y);
    ctx.save();
    ctx.globalAlpha = clip?.enabled === false ? palette.disabledOpacity : 1;
    ctx.fillStyle = color?.foreground ?? (artwork ? palette.labelText : transition ? palette.text : palette.itemText);
    if (artwork || color) {
      ctx.fillStyle = color?.background ?? palette.labelBackground;
      ctx.beginPath();
      ctx.roundRect(labelX - 3, y - 7, Math.min(width + 6, ctx.measureText(label).width + 8), 14, palette.radius);
      ctx.fill();
      ctx.fillStyle = color?.foreground ?? palette.labelText;
    }
    ctx.beginPath();
    ctx.rect(labelX, 0, width, geometry.height);
    ctx.clip();
    ctx.fillText(label, labelX - (marquee?.id === id ? marquee.offset : 0), y);
    ctx.restore();
  }
  ctx.restore();
}
