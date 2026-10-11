// The supplied footage has 240 frames at 24 fps. Beam seeks frozen frames so
// offline rendering never depends on Chromium's live video compositor.
export function frameIndex(seconds: number) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.min(239, Math.floor(time * 24 + 1e-6));
}
