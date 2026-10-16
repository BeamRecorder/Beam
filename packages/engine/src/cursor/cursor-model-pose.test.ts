import { expect, it } from 'vitest';
import { createCursorModelPose } from './cursor-model-pose';
import type { CursorEvent } from '../capture/capture-session';
import type { CursorMotionSample } from './cursor-motion';
const motion: CursorMotionSample = {
  x: 0.5,
  y: 0.5,
  previousX: 0.5,
  previousY: 0.5,
  deltaSeconds: 1 / 120,
  stopSpringActive: false,
  visible: true,
  cursorId: null,
  shapeId: null,
  cursorKind: null,
  hotspot: { x: 0, y: 0 },
};
const button = (t: number, pressed: boolean, button = 1): CursorEvent => ({
  event: 'button',
  sessionNs: t * 1e9,
  pressed,
  button,
  normalizedX: 0.5,
  normalizedY: 0.5,
});
it('hovers at a stable lit pose without animated buttons', () => {
  expect(createCursorModelPose([button(1, true)])(1, motion, [])).toEqual({ pitch: 0.22, yaw: -0.25, height: 0.32 });
});
it('respects per-button click intensity including zero and maximum', () => {
  const pose = createCursorModelPose([button(1, true)]);
  expect(pose(1, motion, [1], () => 0).height).toBe(0.32);
  expect(pose(1, motion, [1], () => 0.5).height).toBe(0.16);
  expect(pose(1, motion, [1], () => 100).height).toBe(0);
});
it('approaches the click exactly and stays in contact through an arbitrarily long drag', () => {
  const pose = createCursorModelPose([button(1, true), button(10000, false)]);
  expect(pose(0.7, motion, [1]).height).toBe(0.32);
  expect(pose(0.91, motion, [1]).height).toBeCloseTo(0.16);
  for (const t of [1, 2, 9999, 10000]) expect(pose(t, motion, [1]).height).toBe(0);
});
it('settles after release with a bounded bounce and deterministic reverse seeking', () => {
  const pose = createCursorModelPose([button(2, false), button(1, true)]);
  const earlier = pose(1.9, motion, [1]);
  expect(pose(2.1, motion, [1]).height).toBeGreaterThan(0.32);
  expect(pose(10, motion, [1]).height).toBe(0.32);
  expect(pose(1.9, motion, [1])).toEqual(earlier);
});
it('keeps simultaneous buttons in contact until all animated presses end', () => {
  const pose = createCursorModelPose([button(1, true), button(1.5, true, 2), button(2, false), button(3, false, 2)]);
  expect(pose(2.1, motion, [1, 2]).height).toBe(0);
  expect(pose(3, motion, [1, 2]).height).toBe(0);
  expect(pose(4, motion, [1, 2]).height).toBe(0.32);
});
it('bounds orientation at extreme speed and zero sampling interval', () => {
  const pose = createCursorModelPose([])(0, { ...motion, x: 1, y: 0, deltaSeconds: 0 }, []);
  expect(pose.pitch).toBeCloseTo(0.08);
  expect(pose.yaw).toBeCloseTo(-0.11);
});
it('ignores moves and combines a release with a pending next press', () => {
  const pose = createCursorModelPose([button(1, true), button(2, false), button(2.15, true)]);
  expect(pose(2.05, motion, [1]).height).toBeGreaterThan(0);
  expect(pose(2.05, motion, [1]).height).toBeLessThan(0.32);
});
