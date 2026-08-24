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

export type PhoneFrameFill =
  | ColorFill
  | { kind: 'adaptive' }
  | { kind: 'continuity'; blur: number; brightness: number };

export const DEFAULT_COLOR_FILL: ColorFill = {
  kind: 'color',
  color: '#111827',
};

export const DEFAULT_PHONE_FRAME_FILL: PhoneFrameFill = {
  kind: 'color',
  color: '#000000',
};

export const DEFAULT_PHONE_FRAME_GRADIENT: ColorGradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { id: 'phone-fill-start', position: 0, color: '#111827', alpha: 1 },
    { id: 'phone-fill-end', position: 1, color: '#4f46e5', alpha: 1 },
  ],
};

export const DEFAULT_PHONE_FRAME_CONTINUITY: Extract<PhoneFrameFill, { kind: 'continuity' }> = {
  kind: 'continuity',
  blur: 32,
  brightness: 72,
};

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

export const isPhoneFrameFill = (value: unknown): value is PhoneFrameFill =>
  Boolean(
    value &&
    typeof value === 'object' &&
    ((value as { kind?: unknown }).kind === 'adaptive' ||
      ((value as { kind?: unknown }).kind === 'continuity' &&
        Number.isFinite((value as { blur?: unknown }).blur) &&
        Number((value as { blur: number }).blur) >= 0 &&
        Number((value as { blur: number }).blur) <= 48 &&
        Number.isFinite((value as { brightness?: unknown }).brightness) &&
        Number((value as { brightness: number }).brightness) >= 20 &&
        Number((value as { brightness: number }).brightness) <= 100)),
  ) || isColorFill(value);
