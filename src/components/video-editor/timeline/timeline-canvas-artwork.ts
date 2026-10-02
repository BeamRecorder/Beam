import type { TimelineCanvasArtwork, TimelineCanvasPalette } from './timeline-canvas-types';

export function paintTimelineArtwork(
  ctx: CanvasRenderingContext2D,
  artwork: TimelineCanvasArtwork,
  rect: { x: number; y: number; width: number; height: number },
  clipDurationMs: number,
  palette: TimelineCanvasPalette,
  viewportWidth: number,
): void {
  const { x, y, width, height } = rect;
  if (artwork.kind === 'color' && artwork.fill) {
    if (artwork.fill.kind === 'color') ctx.fillStyle = artwork.fill.color;
    else {
      const spec = artwork.fill.gradient,
        angle = (spec.angle * Math.PI) / 180;
      const dx = Math.sin(angle),
        dy = -Math.cos(angle),
        length = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
      const cx = x + width / 2,
        cy = y + height / 2;
      const gradient =
        spec.type === 'radial'
          ? ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) / 2)
          : ctx.createLinearGradient(cx - dx * length, cy - dy * length, cx + dx * length, cy + dy * length);
      for (const stop of spec.stops)
        gradient.addColorStop(
          stop.position,
          `${stop.color}${Math.round(stop.alpha * 255)
            .toString(16)
            .padStart(2, '0')}`,
        );
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(x, y, width, height);
  } else if (artwork.kind === 'thumbnails') {
    for (const frame of artwork.frames ?? []) {
      const left = x + (frame.relativeMs / clipDurationMs) * width,
        span = (frame.durationMs / clipDurationMs) * width;
      const image = frame.source;
      if (image) {
        const scale = Math.max(span / image.naturalWidth, height / image.naturalHeight);
        const sw = span / scale,
          sh = height / scale;
        ctx.drawImage(
          image,
          (image.naturalWidth - sw) / 2,
          (image.naturalHeight - sh) / 2,
          sw,
          sh,
          left,
          y,
          span,
          height,
        );
      }
      if (frame.pending || !image) {
        ctx.save();
        ctx.globalAlpha *= image ? 0.15 : 0.32;
        ctx.fillStyle = palette.background;
        ctx.fillRect(left, y, span, height);
        ctx.restore();
      }
    }
  } else if (artwork.source) {
    const image = artwork.source;
    const tileHeight = artwork.kind === 'shape' ? Math.max(1, height - 6) : height;
    const tileWidth = (tileHeight * image.naturalWidth) / image.naturalHeight;
    const start = x + (artwork.kind === 'shape' ? 5 : 0),
      top = y + (height - tileHeight) / 2;
    // Start at the first visible tile, not at an offscreen clip's distant origin.
    const first = Math.max(0, Math.floor(-start / tileWidth));
    for (let i = first; start + i * tileWidth < Math.min(viewportWidth, x + width); i++)
      ctx.drawImage(image, start + i * tileWidth, top, tileWidth, tileHeight);
  }
  if (artwork.loading || artwork.error) {
    ctx.fillStyle = palette.text;
    ctx.font = '500 9px system-ui';
    ctx.fillText(artwork.error ? '!' : '…', Math.max(8, x + width / 2), y + height / 2, Math.max(1, width - 16));
  }
}
