import { THUMBNAIL_WIDTH, thumbnailWidthFor } from '~/media/playback/thumbnail-protocol';

export function timelineThumbnailWidth(
  frames: readonly { durationMs: number }[],
  timelineWidthPx: number | undefined,
  durationSeconds: number,
  devicePixelRatio: number,
): number {
  const pixelsPerSecond = (timelineWidthPx ?? 0) / durationSeconds;
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return THUMBNAIL_WIDTH;
  const widestFrame = Math.max(0, ...frames.map((frame) => (frame.durationMs / 1_000) * pixelsPerSecond));
  return thumbnailWidthFor(widestFrame * devicePixelRatio);
}

export function thumbnailUrlFor(mediaSecond: number, thumbnails: Record<number, string>): string | null {
  const exact = thumbnails[mediaSecond];
  if (exact) return exact;
  let nearest: { distance: number; url: string } | null = null;
  for (const [time, url] of Object.entries(thumbnails)) {
    const distance = Math.abs(Number(time) - mediaSecond);
    if (!nearest || distance < nearest.distance) nearest = { distance, url };
  }
  return nearest?.url ?? null;
}

export function thumbnailIsPending(
  mediaSecond: number,
  thumbnails: Record<number, string>,
  widths: Record<number, number>,
  requestedWidth: number,
): boolean {
  return !thumbnails[mediaSecond] || (widths[mediaSecond] ?? 0) < requestedWidth;
}
