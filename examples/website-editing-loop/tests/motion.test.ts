import { afterEach, describe, expect, it } from 'vitest';
import { createMotion, initialPose, seekSeconds, TRACK_LEFT, px, FIRST_START } from '../src/motion';
import { clipDuration, nextStart, lanes } from '../src/timeline-model';
import type { DemoPose } from '../src/demo-types';

describe('editing demonstration motion', () => {
  const timelines: ReturnType<typeof createMotion>[] = [];
  afterEach(() => timelines.splice(0).forEach((tl) => tl.kill()));
  function setup() {
    const pose = initialPose();
    const tl = createMotion(pose);
    timelines.push(tl);
    return { pose, tl };
  }
  const values = (pose: DemoPose) =>
    Object.fromEntries(Object.keys(initialPose()).map((key) => [key, pose[key as keyof DemoPose]]));
  it('has a five-second paused clock and an identical opening / ending pose', () => {
    const { pose, tl } = setup();
    expect(tl.paused()).toBe(true);
    expect(tl.duration()).toBe(5);
    tl.seek(5, false);
    expect(values(pose)).toEqual(initialPose());
  });
  it.each([1.0, 1.3, 1.7])('keeps the cursor tip on the live trim edge at %ss', (time) => {
    const { pose, tl } = setup();
    tl.seek(time, false);
    expect(pose.cursorX).toBeCloseTo(TRACK_LEFT + px(FIRST_START + clipDuration(pose)) - 5, 3);
    expect(pose.trimActive).toBe(1);
  });
  it.each([2.8, 3.0, 3.3])('keeps the cursor and dragged clip together at %ss', (time) => {
    const { pose, tl } = setup();
    tl.seek(time, false);
    expect(pose.cursorX).toBeCloseTo(TRACK_LEFT + px(nextStart(pose)) + 30, 3);
    expect(pose.moveActive).toBe(1);
  });
  it('shortens the first clip and closes its gap while carrying the associated title', () => {
    const { pose, tl } = setup();
    tl.seek(3.45, false);
    expect(clipDuration(pose)).toBe(3750);
    expect(nextStart(pose)).toBe(FIRST_START + clipDuration(pose));
    expect(pose.snapOpacity).toBe(1);
    const rows = lanes(pose);
    expect(rows).toHaveLength(4);
    const title = rows[0]!.items[1]!,
      screen = rows[1]!.items[1]!;
    expect('clip' in title && title.clip.timelineStartMs).toBe('clip' in screen && screen.clip.timelineStartMs);
  });
  it.each([0, 1.2, 2.9, 4.6, 5])('reconstructs the same pose after reverse seeks at %ss', (time) => {
    const { pose, tl } = setup();
    tl.seek(time, false);
    const first = values(pose);
    tl.seek(4.8, false);
    tl.seek(0, false);
    tl.seek(time, false);
    expect(values(pose)).toEqual(first);
  });
  it.each([-10, 0, 5000, 9000])('clamps finite time %d to the clip interval', (time) => {
    expect(seekSeconds(time)).toBe(Math.min(5000, Math.max(0, time)) / 1000);
  });
  it.each([NaN, Infinity, -Infinity])('rejects invalid time %s', (time) => {
    expect(() => seekSeconds(time)).toThrow('finite');
  });
});
