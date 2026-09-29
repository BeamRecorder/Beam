import type { AudioLevel } from '../beamTypes'

/** A logarithmic -40 dB to 0 dB meter, gating quiet input noise to an empty meter. */
export function meterFill(level: AudioLevel | null | undefined): number {
  if (!level || !Number.isFinite(level.peak) || !Number.isFinite(level.rms) || level.peak <= 0 || level.rms < 0) return 0
  if (level.peak >= 1) return 1
  const amplitude = Math.max(level.rms, level.peak * 0.5)
  if (amplitude <= 0.01) return 0
  return Math.min(1, Math.max(0, (20 * Math.log10(amplitude) + 40) / 40))
}
