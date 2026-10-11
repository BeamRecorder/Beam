import { describe, it, expect } from 'vitest';
import {
  clampTime,
  smooth,
  phaseTime,
  contentOpacity,
  createMotion,
  pointerAt,
  rippleFor,
  CLICKS,
} from '../src/motion';
describe('seek-safe zoom demo clock', () => {
  it('clamps endpoints and invalid clocks', () => {
    expect([clampTime(-1), clampTime(4000), clampTime(9000)]).toEqual([0, 4, 8]);
    for (const value of [NaN, Infinity, -Infinity]) expect(clampTime(value)).toBe(0);
  });
  it('eases without overshooting', () => {
    expect([smooth(-1), smooth(0), smooth(0.5), smooth(1), smooth(2)]).toEqual([0, 0, 0.5, 1, 1]);
  });
  it('resets only while hidden', () => {
    expect(phaseTime(-1)).toBe(0);
    expect(phaseTime(7.5)).toBe(7.5);
    expect(phaseTime(7.6)).toBe(0);
    expect(contentOpacity(0)).toBe(1);
    expect(contentOpacity(7.55)).toBe(0);
    expect(contentOpacity(7.6)).toBe(0);
    expect(contentOpacity(8)).toBe(1);
    expect(contentOpacity(7.35)).toBeGreaterThan(0);
    expect(contentOpacity(7.8)).toBeLessThan(1);
  });
  it('uses one finite paused GSAP timeline', () => {
    const pose = { time: 0 },
      timeline = createMotion(pose);
    expect(timeline.paused()).toBe(true);
    expect(timeline.duration()).toBe(8);
    timeline.seek(4, false);
    expect(pose.time).toBe(4);
    timeline.seek(0, false);
    expect(pose.time).toBe(0);
    timeline.kill();
  });
  for (const mode of ['2d', '3d'] as const) {
    it(`${mode} hits each target exactly and returns home`, () => {
      for (const click of CLICKS[mode]) {
        expect(pointerAt(mode, click.at)).toMatchObject({ x: click.x, y: click.y });
        expect(pointerAt(mode, click.at + 0.1).scale).toBeLessThan(1);
      }
      expect(pointerAt(mode, 0)).toEqual(pointerAt(mode, 8));
      expect(pointerAt(mode, -1)).toEqual(pointerAt(mode, 0));
      expect(pointerAt(mode, 7)).toMatchObject({ x: 300, y: 206 });
    });
    it(`${mode} interpolates within the authored surface`, () => {
      for (let t = 0; t <= 8; t += 0.02) {
        const pose = pointerAt(mode, t);
        expect(pose.x).toBeGreaterThan(0);
        expect(pose.x).toBeLessThan(640);
        expect(pose.y).toBeGreaterThan(0);
        expect(pose.y).toBeLessThan(400);
        expect(Number.isFinite(pose.scale)).toBe(true);
      }
    });
    it(`${mode} emits only finite click ripples`, () => {
      const click = CLICKS[mode][0]!;
      expect(rippleFor(0, click)).toBeNull();
      expect(rippleFor(click.at + 0.12, click)?.rings).toHaveLength(1);
      expect(rippleFor(8, click)).toBeNull();
    });
  }
});
