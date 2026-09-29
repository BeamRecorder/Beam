import { describe, expect, it } from 'vitest';
import { snapStart, timecode, visibleClips } from './timelineModel';
import type { Clip, Project } from '../shared/editorTypes';

const effects = { opacity: 1, volume: 1, brightness: 0, saturation: 1, scale: 1, x: 0.5, y: 0.5, autoZoom: true };
const clip: Clip = {
  id: 'a',
  assetId: 'source',
  trackId: 'video',
  startMs: 1000,
  sourceInMs: 0,
  durationMs: 1000,
  effects,
};
const other: Clip = { ...clip, id: 'b', startMs: 5000 };
const project: Project = {
  id: 'p',
  name: 'Test',
  canvas: { width: 1920, height: 1080, fps: 30, background: 0 },
  assets: [],
  tracks: [],
  clips: [clip, other],
  warnings: [],
};
describe('native timeline calculations', () => {
  it.each([
    [0, '00:00.000'],
    [1234.99, '00:01.234'],
    [61_005, '01:01.005'],
    [-100, '00:00.000'],
    [NaN, '00:00.000'],
  ])('formats source time %s', (value, formatted) => expect(timecode(value)).toBe(formatted));
  it('uses half-open visibility intervals and handles empty lanes', () => {
    expect(visibleClips([], 0, 5000)).toEqual([]);
    expect(visibleClips([clip, other], 2000, 5000)).toEqual([]);
    expect(visibleClips([clip, other], 1500, 5500)).toEqual([clip, other]);
  });
  it('snaps either clip edge to the playhead and ignores its own old position', () => {
    expect(snapStart(3999, clip, project, 8000, 80)).toBe(4000);
    expect(snapStart(7999, clip, project, 8000, 80)).toBe(8000);
    expect(snapStart(1010, clip, project, 8000, 80)).toBe(1010);
  });
  it('clamps negative drags and makes snapping follow screen magnification', () => {
    expect(snapStart(-200, clip, project, 8000, 80)).toBe(0);
    expect(snapStart(3900, clip, project, 8000, 40)).toBe(4000);
    expect(snapStart(3900, clip, project, 8000, 160)).toBe(3900);
  });
});
