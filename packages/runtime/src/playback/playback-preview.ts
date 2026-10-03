export const PREVIEW_QUALITIES = ['full', 'half', 'quarter'] as const;
export type PreviewQuality = (typeof PREVIEW_QUALITIES)[number];

export const isPreviewQuality = (value: unknown): value is PreviewQuality =>
  PREVIEW_QUALITIES.includes(value as PreviewQuality);

export function previewRenderScale(
  displayWidth: number,
  displayHeight: number,
  pixelRatio: number,
  quality: PreviewQuality,
) {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0 || !Number.isFinite(displayHeight) || displayHeight <= 0) {
    throw new RangeError('The preview has invalid display dimensions.');
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new RangeError('The preview has an invalid pixel ratio.');
  if (!isPreviewQuality(quality)) throw new RangeError('The playback preview quality is invalid.');
  if (quality === 'full') return pixelRatio;
  if (quality === 'half') return pixelRatio * 0.5;
  return pixelRatio * 0.25;
}

export function playbackPreviewDimensions(
  displayWidth: number,
  displayHeight: number,
  quality: PreviewQuality = 'full',
) {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0 || !Number.isFinite(displayHeight) || displayHeight <= 0) {
    throw new RangeError('The playback video has invalid display dimensions.');
  }
  const scale = previewRenderScale(displayWidth, displayHeight, 1, quality);
  return {
    width: Math.max(1, Math.floor(displayWidth * scale)),
    height: Math.max(1, Math.floor(displayHeight * scale)),
  };
}
