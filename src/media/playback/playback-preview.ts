const MAX_PREVIEW_WIDTH = 1_920;
const MAX_PREVIEW_HEIGHT = 1_080;

export function playbackPreviewDimensions(displayWidth: number, displayHeight: number) {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0 || !Number.isFinite(displayHeight) || displayHeight <= 0) {
    throw new RangeError('The playback video has invalid display dimensions.');
  }
  const scale = Math.min(1, MAX_PREVIEW_WIDTH / displayWidth, MAX_PREVIEW_HEIGHT / displayHeight);
  return {
    width: Math.max(1, Math.floor(displayWidth * scale)),
    height: Math.max(1, Math.floor(displayHeight * scale)),
  };
}
