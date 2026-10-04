import { describe, expect, it } from 'vitest';
import {
  audioState,
  captionState,
  clampTime,
  contentOpacity,
  createMotion,
  phaseTime,
  pointerAt,
  rippleFor,
  smooth,
  CLICKS,
} from '../src/motion';

describe('finite render clock', () => {
  it.each([NaN, Infinity, -Infinity])('rejects invalid clock %s', (value) => expect(clampTime(value)).toBe(0));
  it.each([
    [-1, 0],
    [0, 0],
    [500, 0.5],
    [8000, 8],
    [9000, 8],
  ])('clamps %s ms', (value, expected) => expect(clampTime(value)).toBe(expected));
  it.each([-2, 0, 0.5, 1, 2])('bounds smoothstep %s', (value) => expect(smooth(value)).toBeGreaterThanOrEqual(0));
  it('has a paused eight-second root', () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    expect(tl.paused()).toBe(true);
    expect(tl.duration()).toBe(8);
    tl.kill();
  });
  it('seeks forward and back without stale state', () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    tl.seek(5);
    expect(pose.time).toBe(5);
    tl.seek(1);
    expect(pose.time).toBe(1);
    tl.kill();
  });
  it('seeks both finite endpoints', () => {
    const pose = { time: 0 },
      tl = createMotion(pose);
    tl.seek(8);
    expect(pose.time).toBe(8);
    tl.seek(0);
    expect(pose.time).toBe(0);
    tl.kill();
  });
});
describe('seamless state reset', () => {
  it.each([0, 1, 7.2, 7.4])('keeps the authored clock before reset %s', (t) => expect(phaseTime(t)).toBe(t));
  it.each([7.6, 7.8, 8])('resets the clock underneath the hidden editor %s', (t) => expect(phaseTime(t)).toBe(0));
  it.each([0, 7.2, 8])('keeps full opacity at the opening and seam %s', (t) => expect(contentOpacity(t)).toBe(1));
  it.each([7.55, 7.6, 7.65])('hides the state replacement %s', (t) => expect(contentOpacity(t)).toBe(0));
  it('fades away and returns with bounded opacity', () => {
    expect(contentOpacity(7.35)).toBeLessThan(1);
    expect(contentOpacity(7.8)).toBeGreaterThan(0);
    for (let t = 0; t <= 8; t += 0.05) expect(contentOpacity(t)).toBeGreaterThanOrEqual(0);
  });
});
describe.each(['captions', 'audio'] as const)('%s cursor choreography', (mode) => {
  it('returns the same initial pose at the seam', () => expect(pointerAt(mode, 8)).toEqual(pointerAt(mode, 0)));
  it('never places the cursor outside the editor', () => {
    for (let t = 0; t <= 8; t += 0.025) {
      const pose = pointerAt(mode, t);
      expect(pose.x).toBeGreaterThan(20);
      expect(pose.x).toBeLessThan(620);
      expect(pose.y).toBeGreaterThan(17);
      expect(pose.y).toBeLessThan(383);
    }
  });
  it('replays backward identically', () => {
    const first = pointerAt(mode, 2.23);
    pointerAt(mode, 7);
    expect(pointerAt(mode, 2.23)).toEqual(first);
  });
  it('uses a native click spring and ripple', () => {
    const click = CLICKS[mode][0]!;
    expect(pointerAt(mode, click.at + 0.08).scale).not.toBe(1);
    expect(rippleFor(click.at + 0.12, click)?.rings[0]?.opacity).toBeGreaterThan(0);
  });
  it('has no lingering ripple before or after a click', () => {
    const click = CLICKS[mode][0]!;
    expect(rippleFor(0, click)).toBeNull();
    expect(rippleFor(7, click)).toBeNull();
    expect(rippleFor(8, click)).toBeNull();
  });
});
describe('captions actions', () => {
  it('starts with a ready model and no fabricated transcript', () => {
    const state = captionState(0);
    expect(state.generated).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.playheadMs).toBe(0);
  });
  it('generates before styling and then enables word highlights', () => {
    expect(captionState(1).progress).toBeGreaterThan(0);
    expect(captionState(1.55).generated).toBe(true);
    expect(captionState(2.1).styling).toBe(true);
    expect(captionState(3.05).highlight).toBe(true);
  });
  it('changes font size, background and transcript in order', () => {
    expect(captionState(4.25).fontSize).toBeGreaterThan(104);
    expect(captionState(4.6).fontSize).toBe(128);
    expect(captionState(5.1).background).toBe(true);
    expect(captionState(6.2).transcript).toBe(true);
  });
  it('bounds the playhead and resets every control', () => {
    expect(captionState(7.5).playheadMs).toBe(7900);
    expect(captionState(8)).toEqual(captionState(0));
  });
});
describe('audio actions', () => {
  it('records only between the record and stop clicks', () => {
    expect(audioState(0).phase).toBe('idle');
    expect(audioState(0.75).phase).toBe('recording');
    expect(audioState(2.4).phase).toBe('idle');
    expect(audioState(2.4).recorded).toBe(true);
  });
  it('adds and selects the take before touching volume', () => {
    expect(audioState(2.5).selected).toBe(false);
    expect(audioState(3.1).selected).toBe(true);
    expect(audioState(4.2).volume).toBeGreaterThan(78);
    expect(audioState(4.5).volume).toBe(78);
  });
  it('shows pending normalization before its result', () => {
    expect(audioState(5.15).normalizing).toBe(true);
    expect(audioState(5.5).normalized).toBe(false);
    expect(audioState(5.7).normalized).toBe(true);
    expect(audioState(5.7).normalizing).toBe(false);
  });
  it('caps recording progress and clears everything at the seam', () => {
    expect(audioState(0).recordProgress).toBe(0);
    expect(audioState(3).recordProgress).toBe(1);
    expect(audioState(7.5).playheadMs).toBe(7700);
    expect(audioState(8)).toEqual(audioState(0));
  });
});
