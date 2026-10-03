import type { GradientStop, GradientValue } from './gradient-types';
import { parseColorHex } from '../ColorPicker/color-hex';

export const clampGradientPosition = (value: number): number => Math.max(0, Math.min(1, value));

export function normalizeGradient(value: GradientValue | null | undefined): GradientValue {
  const stops = (value?.stops ?? []).map((stop, index, source) => ({
    id: stop.id || `gradient-stop-${index}`,
    position: Number.isFinite(stop.position)
      ? clampGradientPosition(stop.position)
      : source.length > 1
        ? index / (source.length - 1)
        : 0,
    color: parseColorHex(stop.color) ?? '#ffffff',
    alpha: Number.isFinite(stop.alpha) ? clampGradientPosition(stop.alpha!) : 1,
  }));
  // An unset picker is a draft. It does not publish defaults until the user edits it.
  if (stops.length === 0) {
    stops.push({ id: 'gradient-start', position: 0, color: '#000000', alpha: 1 });
    stops.push({ id: 'gradient-end', position: 1, color: '#ffffff', alpha: 1 });
  } else if (stops.length === 1) {
    const position = stops[0]!.position < 0.5 ? 1 : 0;
    stops.push({ ...stops[0]!, id: `${stops[0]!.id}-endpoint`, position });
  }
  return {
    type: value?.type === 'radial' ? 'radial' : 'linear',
    angle: Number.isFinite(value?.angle) ? ((value!.angle! % 360) + 360) % 360 : 90,
    stops: stops.sort((a, b) => a.position - b.position),
  };
}

export function gradientStopColor(stop: GradientStop): string {
  const rgb = [1, 3, 5].map((offset) => parseInt(stop.color.slice(offset, offset + 2), 16));
  return `rgba(${rgb.join(', ')}, ${stop.alpha ?? 1})`;
}

export function gradientCss(value: GradientValue, track = false): string {
  const stops = value.stops.map((stop) => `${gradientStopColor(stop)} ${stop.position * 100}%`).join(', ');
  return value.type === 'radial' && !track
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${track ? 90 : (value.angle ?? 90)}deg, ${stops})`;
}

export function interpolateGradientStop(
  stops: GradientStop[],
  position: number,
): Pick<GradientStop, 'color' | 'alpha'> {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const right = sorted.find((stop) => stop.position > position);
  const left = sorted.filter((stop) => stop.position <= position).at(-1);
  if (!left || !right) {
    const endpoint = left ?? right;
    return { color: endpoint?.color ?? '#000000', alpha: endpoint?.alpha ?? 1 };
  }
  const ratio = (position - left.position) / (right.position - left.position);
  const leftAlpha = left.alpha ?? 1;
  const rightAlpha = right.alpha ?? 1;
  const alpha = leftAlpha + (rightAlpha - leftAlpha) * ratio;
  // CSS and Canvas interpolate premultiplied sRGB, including transparent stops.
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(left.color.slice(offset, offset + 2), 16) * leftAlpha;
    const b = parseInt(right.color.slice(offset, offset + 2), 16) * rightAlpha;
    return Math.round(alpha ? (a + (b - a) * ratio) / alpha : 0)
      .toString(16)
      .padStart(2, '0');
  });
  return { color: `#${channels.join('')}`, alpha };
}

export function nextGradientStopPosition(stops: GradientStop[], selectedId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const index = Math.max(
    0,
    sorted.findIndex((stop) => stop.id === selectedId),
  );
  const current = sorted[index];
  const neighbor = sorted[index + 1] ?? sorted[index - 1];
  return current && neighbor ? (current.position + neighbor.position) / 2 : 0.5;
}
