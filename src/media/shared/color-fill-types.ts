export interface ColorGradientStop {
  id: string;
  position: number;
  color: string;
  alpha: number;
}

export interface ColorGradient {
  type: 'linear' | 'radial';
  angle: number;
  stops: ColorGradientStop[];
}

export type ColorFill = { kind: 'color'; color: string } | { kind: 'gradient'; gradient: ColorGradient };

export const DEFAULT_COLOR_FILL: ColorFill = { kind: 'color', color: '#111827' };

const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const isColorGradient = (value: unknown): value is ColorGradient => {
  if (!value || typeof value !== 'object') return false;
  const gradient = value as Partial<ColorGradient>;
  return (
    (gradient.type === 'linear' || gradient.type === 'radial') &&
    Number.isFinite(gradient.angle) &&
    Number(gradient.angle) >= 0 &&
    Number(gradient.angle) < 360 &&
    Array.isArray(gradient.stops) &&
    gradient.stops.length >= 2 &&
    gradient.stops.every(
      (stop) =>
        Boolean(stop?.id) &&
        Number.isFinite(stop.position) &&
        stop.position >= 0 &&
        stop.position <= 1 &&
        isHexColor(stop.color) &&
        Number.isFinite(stop.alpha) &&
        stop.alpha >= 0 &&
        stop.alpha <= 1,
    )
  );
};

export const isColorFill = (value: unknown): value is ColorFill => {
  if (!value || typeof value !== 'object') return false;
  const fill = value as Partial<ColorFill>;
  return fill.kind === 'color'
    ? isHexColor('color' in fill ? fill.color : undefined)
    : fill.kind === 'gradient' && isColorGradient('gradient' in fill ? fill.gradient : undefined);
};
