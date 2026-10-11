import { describe, expect, it } from 'vitest';
import { clampTime, clickScale, createMotion, DURATION_MS, initialPose, stateAt, STEPS } from '../src/motion';
import { resolvePublicAssetUrl } from '../src/public-asset';

describe('Recorder website loop', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1234, 1.234],
    [12000, 12],
    [13000, 12],
    [NaN, 0],
    [Infinity, 0],
  ])('bounds seek %s', (input, output) => {
    expect(clampTime(input)).toBe(output);
  });
  it('creates independent initial poses', () => {
    const first = initialPose();
    first.x = 0;
    expect(initialPose().x).toBe(1015);
  });
  it('opens in the actual Recorder and full-screen selection', () => {
    expect(stateAt(0)).toMatchObject({ mode: 'studio', target: 'screen', phase: 'idle' });
    expect(initialPose()).toMatchObject({ setupOpacity: 1, barOpacity: 0, camera: 0 });
  });
  it('returns to the same pose at the loop seam', () => {
    const pose = initialPose();
    const timeline = createMotion(pose);
    timeline.seek(DURATION_MS / 1000);
    const { time: _, ...last } = pose;
    const { time: __, ...first } = initialPose();
    expect(last).toMatchObject(first);
    expect(stateAt(12).mode).toBe(stateAt(0).mode);
    expect(stateAt(12).target).toBe(stateAt(0).target);
    timeline.kill();
  });
  it.each(STEPS)('places the pointer over $label at $at', (step) => {
    const pose = initialPose();
    const timeline = createMotion(pose);
    timeline.seek(step.at);
    expect(pose.x).toBeCloseTo(step.x, 4);
    expect(pose.y).toBeCloseTo(step.y, 4);
    expect(pose.time).toBeCloseTo(step.at, 4);
    const state = stateAt(step.at);
    if (step.mode) expect(state.mode).toBe(step.mode);
    if (step.target) expect(state.target).toBe(step.target);
    if (step.phase) expect(state.phase).toBe(step.phase);
    timeline.kill();
  });
  it('supports repeated backwards seeks', () => {
    const pose = initialPose();
    const timeline = createMotion(pose);
    timeline.seek(8.5);
    const first = { ...pose };
    timeline.seek(12).seek(0).seek(8.5);
    expect({ ...pose }).toEqual(first);
    timeline.kill();
  });
  it('holds elapsed time while paused and continues after resume', () => {
    expect(stateAt(8.25).recordingTime).toBe('00:01.2');
    expect(stateAt(9).recordingTime).toBe('00:01.2');
    expect(stateAt(9.55).recordingTime).toBe('00:01.7');
    expect(stateAt(11).recordingTime).toBe('00:02.1');
  });
  it('changes state precisely on click boundaries', () => {
    expect(stateAt(2.049).target).toBe('screen');
    expect(stateAt(2.05).target).toBe('region');
    expect(stateAt(3.3).target).toBe('window');
    expect(stateAt(10.3)).toMatchObject({ mode: 'studio', target: 'screen' });
  });
  it('keeps the cursor unchanged before a click and after settling', () => {
    expect(clickScale(0)).toBe(1);
    expect(clickScale(12)).toBe(1);
    expect(clickScale(0.91)).toBeLessThan(1);
    expect(clickScale(0.91)).toBeGreaterThan(0.5);
  });
  it('freezes the actual capture-card wallpaper', () => {
    expect(resolvePublicAssetUrl('/wallpapers/image/sequoia-blue.webp')).toContain('sequoia-blue.webp');
  });
  it('freezes the actual Beam brand asset', () => {
    expect(resolvePublicAssetUrl('/brand/BeamIcon.webp')).toContain('BeamIcon.webp');
  });
  it('rejects an unbundled component asset', () => {
    expect(() => resolvePublicAssetUrl('/missing.png')).toThrow('Unbundled Recorder asset');
  });
  it.each(['recorder', 'screenshot', 'instant'])('freezes the %s mode icon', (name) => {
    const asset = resolvePublicAssetUrl(`/icons/capture/beam-${name}.svg`);
    expect(asset).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(asset)).toContain('<svg');
  });
});
