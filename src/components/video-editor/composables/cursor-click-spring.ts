/** A deterministic, frame-rate independent click response shared by preview and export. */
export function cursorClickSpringScale(ageSeconds: number, enabled: boolean) {
  if (!enabled || ageSeconds < 0 || ageSeconds >= 0.28) return 1;
  const progress = ageSeconds / 0.28;
  const envelope = Math.sin(Math.PI * progress) ** 2;
  return 1 - 0.09 * envelope * (1 + 0.16 * Math.sin(Math.PI * progress * 3));
}
