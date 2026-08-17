const MAX_AUTO_PREVIEW_WIDTH = 1_280;
const MAX_AUTO_PREVIEW_HEIGHT = 720;

export const PREVIEW_QUALITIES = ['auto', 'full', 'half', 'quarter'] as const;
export type PreviewQuality = (typeof PREVIEW_QUALITIES)[number];

export const isPreviewQuality = (value: unknown): value is PreviewQuality =>
  PREVIEW_QUALITIES.includes(value as PreviewQuality);

export function playbackPreviewDimensions(
  displayWidth: number,
  displayHeight: number,
  quality: PreviewQuality = 'auto',
) {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0 || !Number.isFinite(displayHeight) || displayHeight <= 0) {
    throw new RangeError('The playback video has invalid display dimensions.');
  }
  if (!isPreviewQuality(quality)) throw new RangeError('The playback preview quality is invalid.');
  const scale =
    quality === 'auto'
      ? Math.min(1, MAX_AUTO_PREVIEW_WIDTH / displayWidth, MAX_AUTO_PREVIEW_HEIGHT / displayHeight)
      : quality === 'full'
        ? 1
        : quality === 'half'
          ? 0.5
          : 0.25;
  return {
    width: Math.max(1, Math.floor(displayWidth * scale)),
    height: Math.max(1, Math.floor(displayHeight * scale)),
  };
}
