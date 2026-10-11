import { describe, expect, it } from 'vitest';
import {
  clampTime,
  clickScale,
  createMotion,
  initialPose,
  PAUSE_AT,
  PAUSE_POINT,
  RESUME_AT,
  stateAt,
} from '../src/motion';

describe('breath demo clock', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1200, 1.2],
    [10000, 10],
    [20000, 10],
    [NaN, 0],
    [Infinity, 0],
  ])('bounds %s milliseconds to %s seconds', (input, output) => expect(clampTime(input)).toBe(output));
  it('records before Pause and resumes at the second click', () => {
    expect(stateAt(0).phase).toBe('recording');
    expect(stateAt(PAUSE_AT - 0.001).phase).toBe('recording');
    expect(stateAt(PAUSE_AT).phase).toBe('paused');
    expect(stateAt(RESUME_AT - 0.001).phase).toBe('paused');
    expect(stateAt(RESUME_AT).phase).toBe('recording');
  });
  it('holds the clock throughout the breathing interval', () => {
    for (const time of [1.2, 2, 3.5, 4.649, 4.65]) expect(stateAt(time).recordingTime).toBe('00:13.2');
    expect(stateAt(5.65).recordingTime).toBe('00:14.2');
    expect(stateAt(8.65).recordingTime).toBe('00:17.2');
  });
  it('crossfades only the end of the footage and restores its opening state', () => {
    expect(stateAt(0).resetOpacity).toBe(1);
    expect(stateAt(0.075).resetOpacity).toBeCloseTo(0.5);
    expect(stateAt(9.5).resetOpacity).toBe(0);
    expect(stateAt(9.775).resetOpacity).toBeCloseTo(0.5);
    expect(stateAt(10).resetOpacity).toBeCloseTo(1);
    expect(stateAt(10).recordingTime).toBe(stateAt(0).recordingTime);
  });
  it('handles negative and non-finite state times', () => {
    for (const time of [-1, NaN, Infinity]) expect(stateAt(time)).toEqual(stateAt(0));
    expect(stateAt(100)).toEqual(stateAt(10));
  });
  it('returns a new independent opening pose', () => {
    const first = initialPose();
    first.x = 0;
    expect(initialPose()).toEqual({ time: 0, x: 1015, y: 535, camera: 0 });
  });
  it('lands on the same native button for both clicks, including reverse seeks', () => {
    const pose = initialPose(),
      timeline = createMotion(pose);
    for (const time of [RESUME_AT, PAUSE_AT, RESUME_AT]) {
      timeline.seek(time, false);
      expect(pose.x).toBe(PAUSE_POINT.x);
      expect(pose.y).toBe(PAUSE_POINT.y);
      expect(pose.time).toBe(time);
    }
    timeline.kill();
  });
  it('restores the opening camera and pointer at the loop boundary', () => {
    const pose = initialPose(),
      timeline = createMotion(pose);
    timeline.seek(3, false);
    expect(pose.camera).toBe(1);
    timeline.seek(10, false);
    expect(pose).toMatchObject({ ...initialPose(), time: 10 });
    timeline.seek(0, false);
    expect(pose).toMatchObject(initialPose());
    timeline.kill();
  });
  it('uses the Beam click spring only after each authored click', () => {
    expect(clickScale(0)).toBe(1);
    expect(clickScale(1.2)).toBe(1);
    expect(clickScale(1.25)).toBeLessThan(1);
    expect(clickScale(4.7)).toBeLessThan(1);
    expect(clickScale(9)).toBeCloseTo(1);
  });
});
