import type { LabColor } from './gradient-types';

/** Oklab matrices: Björn Ottosson, public domain.
 * https://bottosson.github.io/posts/oklab/
 * The renderer mixes perceived lightness rather than gamma-encoded RGB.
 */
export function toOklab(color: string): LabColor {
  // Hex is deliberately the engine's portable, SSR-safe palette format.
  const hex = color.trim().replace(/^#/, '');
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex))
    throw new TypeError(`Invalid gradient color: ${color}. Use #RGB or #RRGGBB.`);
  const expanded = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const linear = (offset: number) => {
    const value = parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(0),
    g = linear(2),
    b = linear(4);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
