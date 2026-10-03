import type { EyeGeometry } from './bot-types';

export const DEFAULT_EYE_GEOMETRY: Readonly<EyeGeometry> = Object.freeze({
  size: 1,
  width: 1,
  height: 1,
  spacing: 1,
  offsetY: 0,
});
export const EYE_GEOMETRY_LIMITS: Record<keyof EyeGeometry, readonly [number, number]> = {
  size: [0.5, 1.8],
  width: [0.5, 1.5],
  height: [0.5, 1.5],
  spacing: [0.6, 1.6],
  offsetY: [-0.2, 0.2],
};

export function validateEyeGeometry(value: unknown): EyeGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réglages des yeux invalides.');
  const geometry = value as Record<string, unknown>;
  for (const [key, [min, max]] of Object.entries(EYE_GEOMETRY_LIMITS)) {
    const number = geometry[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)
      throw new Error(`Réglage des yeux invalide : ${key}.`);
  }
  return {
    size: geometry.size as number,
    width: geometry.width as number,
    height: geometry.height as number,
    spacing: geometry.spacing as number,
    offsetY: geometry.offsetY as number,
  };
}
