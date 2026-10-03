import type { LayerPerspectiveRect } from './layer-perspective-types';
import type { AlignmentIndexOptions, AlignmentMeasurement, IndexedAlignmentResult } from './alignment-index-types';
const edges = (start: number, length: number) => [start, start + length / 2, start + length];
const sorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
function nearest(values: readonly number[], value: number) {
  let low = 0,
    high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! < value) low = mid + 1;
    else high = mid;
  }
  const a = values[Math.max(0, low - 1)]!,
    b = values[Math.min(values.length - 1, low)]!;
  return Math.abs(a - value) <= Math.abs(b - value) ? a : b;
}
function snapAxis(values: readonly number[], start: number, length: number, tolerance: number) {
  let delta = 0,
    distance = tolerance;
  for (const edge of edges(start, length)) {
    const change = nearest(values, edge) - edge;
    if (Math.abs(change) < distance) {
      delta = change;
      distance = Math.abs(change);
    }
  }
  const guides =
    distance < tolerance
      ? [
          ...new Set(
            edges(start + delta, length)
              .map((edge) => nearest(values, edge))
              .filter((target) => edges(start + delta, length).some((edge) => Math.abs(target - edge) < 1e-7)),
          ),
        ]
      : [];
  return { delta, guides };
}
/** Cache all anchors once per gesture. Each alignment query performs six binary searches. */
export function createAlignmentIndex({ targets, canvas }: AlignmentIndexOptions) {
  const x = sorted([0, 0.05, 0.5, 0.95, 1, ...targets.flatMap((r) => edges(r.x, r.width))]);
  const y = sorted([0, 0.05, 0.5, 0.95, 1, ...targets.flatMap((r) => edges(r.y, r.height))]);
  const measurements = (rect: LayerPerspectiveRect): AlignmentMeasurement[] => {
    const values: AlignmentMeasurement[] = [
      {
        axis: 'x',
        from: rect.x,
        to: rect.x + rect.width,
        cross: Math.max(0.01, rect.y - 0.025),
        pixels: rect.width * canvas.width,
        kind: 'size',
      },
      {
        axis: 'y',
        from: rect.y,
        to: rect.y + rect.height,
        cross: Math.min(0.99, rect.x + rect.width + 0.02),
        pixels: rect.height * canvas.height,
        kind: 'size',
      },
    ];
    for (const axis of ['x', 'y'] as const) {
      const other = axis === 'x' ? 'y' : 'x',
        size = axis === 'x' ? 'width' : 'height',
        otherSize = axis === 'x' ? 'height' : 'width';
      let before: LayerPerspectiveRect | undefined, after: LayerPerspectiveRect | undefined;
      for (const target of targets) {
        if (target[other] + target[otherSize] <= rect[other] || target[other] >= rect[other] + rect[otherSize])
          continue;
        if (
          target[axis] + target[size] <= rect[axis] &&
          (!before || target[axis] + target[size] > before[axis] + before[size])
        )
          before = target;
        if (target[axis] >= rect[axis] + rect[size] && (!after || target[axis] < after[axis])) after = target;
      }
      for (const target of [before, after]) {
        if (!target) continue;
        const from = target === before ? target[axis] + target[size] : rect[axis] + rect[size];
        const to = target === before ? rect[axis] : target[axis];
        if (to - from < 1e-8) continue;
        const cross =
          (Math.max(target[other], rect[other]) +
            Math.min(target[other] + target[otherSize], rect[other] + rect[otherSize])) /
          2;
        values.push({
          axis,
          from,
          to,
          cross,
          pixels: (to - from) * (axis === 'x' ? canvas.width : canvas.height),
          kind: 'spacing',
        });
      }
    }
    return values;
  };
  return (rect: LayerPerspectiveRect, tolerance: { x: number; y: number }): IndexedAlignmentResult => {
    const sx = snapAxis(x, rect.x, rect.width, tolerance.x),
      sy = snapAxis(y, rect.y, rect.height, tolerance.y);
    const snapped = { ...rect, x: rect.x + sx.delta, y: rect.y + sy.delta };
    return {
      x: snapped.x,
      y: snapped.y,
      guides: [
        ...sx.guides.map((position) => ({ type: 'vertical' as const, position })),
        ...sy.guides.map((position) => ({ type: 'horizontal' as const, position })),
      ],
      measurements: measurements(snapped),
    };
  };
}
