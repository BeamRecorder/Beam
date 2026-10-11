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
  it('enlarges the text while reading and closes the size popover', () => {
    expect(stateAt(1.699).fontOpen).toBe(false);
    expect(stateAt(1.7).fontOpen).toBe(true);
    expect(stateAt(2.3).fontSize).toBe(26);
    expect(stateAt(2.65).fontSize).toBe(30);
    expect(stateAt(3).fontSize).toBe(34);
    expect(stateAt(3.35).fontOpen).toBe(false);
    expect(stateAt(6).scroll).toBeGreaterThan(stateAt(3).scroll);
  });
  it('chooses a text color with the native picker after enlarging the text', () => {
    expect(stateAt(3.949).colorOpen).toBe(false);
    expect(stateAt(3.95)).toMatchObject({ fontOpen: false, colorOpen: true, fontSize: 34 });
    expect(stateAt(4.849).colorChanged).toBe(false);
    expect(stateAt(4.85).colorChanged).toBe(true);
    expect(stateAt(5.75)).toMatchObject({ colorOpen: false, colorChanged: true, reading: true });
  });
  it('restores both appearance settings under the loop fade', () => {
    expect(stateAt(7.499)).toMatchObject({ fontSize: 34, colorChanged: true });
    expect(stateAt(7.5)).toMatchObject({ fontSize: 26, colorChanged: false, colorOpen: false });
    expect(stateAt(8)).toEqual(stateAt(0));
  });
  it('keeps the cursor on the size slider thumb throughout the drag', () => {
    const pose = initialPose();
    const timeline = createMotion(pose, 'teleprompter', 'dark');
    for (const time of [2.3, 2.65, 3]) {
      timeline.seek(time);
      const progress = (stateAt(time).fontSize - 26) / 8;
      expect(pose.x).toBeCloseTo(510.5 + progress * 52.3);
      expect(pose.y).toBe(579.6);
    }
    timeline.kill();
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
  it.each([
    ['teleprompter', 'dark'],
    ['teleprompter', 'light'],
    ['projects', 'dark'],
    ['projects', 'light'],
  ] as const)('seeks %s/%s deterministically in reverse', (kind, theme) => {
    const pose = initialPose();
    const timeline = createMotion(pose, kind, theme);
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
