import { describe, it, expect } from 'vitest';
import { clampTime, clickScale, createMotion, initialPose, stateAt } from '../src/motion';
import { resolvePublicAssetUrl } from '../src/public-asset';
describe('recording loops', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [3210, 3.21],
    [9000, 8],
    [NaN, 0],
    [Infinity, 0],
  ])('bounds the authoring clock %s', (input, expected) => expect(clampTime(input)).toBe(expected));
  it('starts as an editable script and plays after the cursor press', () => {
    expect(stateAt(0).reading).toBe(false);
    expect(stateAt(0.849).reading).toBe(false);
    expect(stateAt(0.85).reading).toBe(true);
  });
  it('opens and adjusts the native speed control while the reader progresses', () => {
    expect(stateAt(2.149).speedOpen).toBe(false);
    expect(stateAt(2.15).speedOpen).toBe(true);
    expect(stateAt(3.15).speed).toBe(42);
    expect(stateAt(3.525).speed).toBe(58);
    expect(stateAt(3.9).speed).toBe(74);
    expect(stateAt(4.65).speedOpen).toBe(false);
    expect(stateAt(6).scroll).toBeGreaterThan(stateAt(3).scroll);
  });
  it('reveals the selected local project then its original source file', () => {
    expect(stateAt(1.099).selected).toBe(false);
    expect(stateAt(1.1).selected).toBe(true);
    expect(stateAt(2.2).menuOpen).toBe(true);
    expect(stateAt(3.3).menuOpen).toBe(false);
    expect(stateAt(3.55).folder).toBeCloseTo(0.5);
    expect(stateAt(4).folder).toBe(1);
    expect(stateAt(5.049).sourceSelected).toBe(false);
    expect(stateAt(5.05).sourceSelected).toBe(true);
  });
  it('resets under the fade and returns to the opening state at the loop seam', () => {
    expect(stateAt(7.25).opacity).toBeCloseTo(0.5);
    expect(stateAt(7.5).opacity).toBe(0);
    expect(stateAt(7.75).opacity).toBeCloseTo(0.5);
    expect(stateAt(8)).toEqual(stateAt(0));
    expect(stateAt(NaN)).toEqual(stateAt(0));
  });
  it.each(['teleprompter', 'projects'] as const)('seeks %s deterministically in reverse', (kind) => {
    const pose = initialPose();
    const timeline = createMotion(pose, kind);
    timeline.seek(3.5);
    const first = { ...pose };
    timeline.seek(8);
    timeline.seek(0);
    timeline.seek(3.5);
    expect(pose).toEqual(first);
    timeline.seek(8);
    expect(pose.x).toBe(1060);
    expect(pose.y).toBe(580);
    expect(pose.camera).toBe(0);
    timeline.kill();
  });
  it.each(['teleprompter', 'projects'] as const)('uses the Beam cursor spring for %s clicks', (kind) => {
    expect(clickScale(0, kind)).toBe(1);
    const click = kind === 'teleprompter' ? 0.85 : 1.1;
    expect(clickScale(click + 0.025, kind)).toBeLessThan(1);
    expect(clickScale(8, kind)).toBeCloseTo(1);
  });
  it.each([
    '/wallpapers/image/sequoia-blue.webp',
    '/brand/BeamIcon.webp',
    '/icons/capture/beam-recorder.svg',
    '/icons/capture/beam-screenshot.svg',
    '/icons/capture/beam-instant.svg',
  ])('freezes native asset %s locally', (path) => expect(resolvePublicAssetUrl(path)).toBeTruthy());
  it('rejects an unbundled native asset', () => expect(() => resolvePublicAssetUrl('/unknown')).toThrow('Unbundled'));
});
