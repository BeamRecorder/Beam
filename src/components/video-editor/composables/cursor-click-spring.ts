/** A deterministic, frame-rate independent click response shared by preview and export. */
export function cursorClickSpringScale(ageSeconds: number, enabled: boolean) {
  if (!enabled || ageSeconds < 0 || ageSeconds >= 0.42) return 1;
  const pressDuration = 0.07;
  if (ageSeconds < pressDuration) {
    const progress = ageSeconds / pressDuration;
    return 1 - 0.15 * (1 - (1 - progress) ** 3);
  }
  const releaseAge = ageSeconds - pressDuration;
  return 1 - 0.15 * Math.exp(-10 * releaseAge) * Math.cos(28 * releaseAge);
}
