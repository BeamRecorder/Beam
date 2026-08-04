/** A deterministic, frame-rate independent click response shared by preview and export. */
export function cursorClickSpringScale(ageSeconds: number, enabled: boolean, intensity = 50) {
  if (!enabled || ageSeconds < 0 || ageSeconds >= 0.42) return 1
  const amplitude = (0.15 * Math.min(100, Math.max(0, intensity))) / 50
  const pressDuration = 0.07
  if (ageSeconds < pressDuration) {
    const progress = ageSeconds / pressDuration
    return 1 - amplitude * (1 - (1 - progress) ** 3)
  }
  const releaseAge = ageSeconds - pressDuration
  return 1 - amplitude * Math.exp(-10 * releaseAge) * Math.cos(28 * releaseAge)
}
