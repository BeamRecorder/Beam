import { expect, it } from 'vitest';
import { cameraFocusAtPoint, cameraFocusTargetStyle, cameraFocusContainsPoint } from '../camera-focus-presentation';
import { orbitCameraPose } from '@beam/engine/zoom/orbit-camera';
import { projectPerspectivePoint } from '@beam/engine/zoom/perspective-projection';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
const zoom: ZoomElement = {
  id: 'zoom',
  sessionId: 'take',
  startMs: 0,
  endMs: 1000,
  depth: 3,
  mode: 'manual',
  focus: { cx: 0.5, cy: 0.5 },
};
const bounds = { dx: 120, dy: 80, dw: 1920, dh: 1080, scale: 1.5, focusX: 1080, focusY: 620 };
it('hides focus controls for absent, automatic, glass and playing cameras', () => {
  for (const [selected, playing, b] of [
    [null, false, bounds],
    [zoom, true, bounds],
    [zoom, false, null],
    [{ ...zoom, mode: 'auto' }, false, bounds],
    [{ ...zoom, effect: 'glass' }, false, bounds],
  ] as const)
    expect(cameraFocusTargetStyle(b, selected, playing, null)).toEqual({ display: 'none' });
});
it('keeps the flat reticle stable and supports draft focus and omitted camera fields', () => {
  const style = cameraFocusTargetStyle(bounds, zoom, false, null);
  expect(style.transform).toContain('translate3d');
  expect(style.width).toBe('1600px');
  expect(cameraFocusTargetStyle(bounds, zoom, false, { cx: 0.7, cy: 0.6 })).not.toEqual(style);
  const omitted = { dx: 0, dy: 0, dw: 1920, dh: 1080, scale: 0 };
  expect(cameraFocusAtPoint({ x: 960, y: 540 }, omitted, 3)).toEqual({ cx: 0.5, cy: 0.5 });
  expect(cameraFocusTargetStyle(omitted, zoom, false, null).transform).not.toMatch(/NaN|Infinity/);
});
it('projects the reticle and reverses pointer positions through orbit and tilt', () => {
  for (const transform of [
    { tiltX: 0.2, tiltY: -0.3 },
    {
      orbit: orbitCameraPose({
        timeMs: 0,
        weight: 1,
        intensity: 1,
        scale: 1.8,
        fixed: { cx: 0.8, cy: 0.2 },
        pointAt: () => null,
      }),
    },
  ]) {
    const perspective = { tiltX: 0, tiltY: 0, ...transform };
    const viewport = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
    const point = { cx: 0.55, cy: 0.6 };
    const flat = {
      x: bounds.dx + bounds.dw / 2 + (bounds.dx + point.cx * bounds.dw - bounds.focusX) * bounds.scale,
      y: bounds.dy + bounds.dh / 2 + (bounds.dy + point.cy * bounds.dh - bounds.focusY) * bounds.scale,
    };
    const projected = projectPerspectivePoint(flat, viewport, perspective),
      restored = cameraFocusAtPoint(projected, { ...bounds, ...transform }, 3);
    expect(restored.cx).toBeCloseTo(point.cx, 10);
    expect(restored.cy).toBeCloseTo(point.cy, 10);
    const style = cameraFocusTargetStyle({ ...bounds, ...transform }, zoom, false, null);
    expect(style.transform).toContain('matrix3d(');
    expect(style.transformOrigin).toBe('0 0');
  }
});

it('hit-tests the small reticle rather than the full preview, including all four edges', () => {
  const b = { dx: 100, dy: 60, dw: 800, dh: 450, scale: 1 };
  const halfWidth = 800 / 1.8 / 2,
    halfHeight = 450 / 1.8 / 2;
  for (const [x, y] of [
    [500, 285],
    [500 - halfWidth, 285],
    [500 + halfWidth, 285],
    [500, 285 - halfHeight],
    [500, 285 + halfHeight],
  ])
    expect(cameraFocusContainsPoint({ x: x!, y: y! }, b, zoom)).toBe(true);
  for (const [x, y] of [
    [500 - halfWidth - 1, 285],
    [500 + halfWidth + 1, 285],
    [500, 285 - halfHeight - 1],
    [500, 285 + halfHeight + 1],
  ])
    expect(cameraFocusContainsPoint({ x: x!, y: y! }, b, zoom)).toBe(false);
});

it('does not clamp outside clicks into a reticle pinned to an output edge', () => {
  const b = { dx: 0, dy: 0, dw: 800, dh: 450, scale: 1 };
  const edgeZoom = { ...zoom, focus: { cx: 1, cy: 0 } };
  expect(cameraFocusContainsPoint({ x: 799, y: 1 }, b, edgeZoom)).toBe(true);
  for (const point of [
    { x: 801, y: 1 },
    { x: 799, y: -1 },
    { x: 10, y: 400 },
    { x: 400, y: 451 },
    { x: -1, y: 0 },
  ])
    expect(cameraFocusContainsPoint(point, b, edgeZoom)).toBe(false);
});

it('hit-tests the projected reticle with camera scale, translation, tilt and orbit', () => {
  const selected = { ...zoom, depth: 6 as const };
  for (const transform of [
    { tiltX: 0, tiltY: 0 },
    { tiltX: 0.2, tiltY: -0.3 },
    {
      tiltX: 0,
      tiltY: 0,
      orbit: orbitCameraPose({
        timeMs: 0,
        weight: 1,
        intensity: 1,
        scale: 1.8,
        fixed: { cx: 0.8, cy: 0.2 },
        pointAt: () => null,
      }),
    },
  ]) {
    const viewport = { x: bounds.dx, y: bounds.dy, width: bounds.dw, height: bounds.dh };
    for (const [cx, cy, inside] of [
      [0.5, 0.5, true],
      [0.51, 0.51, true],
      [0.75, 0.5, false],
      [0.5, 0.75, false],
    ] as const) {
      const flat = {
        x: bounds.dx + bounds.dw / 2 + (bounds.dx + cx * bounds.dw - bounds.focusX) * bounds.scale,
        y: bounds.dy + bounds.dh / 2 + (bounds.dy + cy * bounds.dh - bounds.focusY) * bounds.scale,
      };
      const point = projectPerspectivePoint(flat, viewport, transform);
      expect(cameraFocusContainsPoint(point, { ...bounds, ...transform }, selected)).toBe(inside);
    }
  }
});
