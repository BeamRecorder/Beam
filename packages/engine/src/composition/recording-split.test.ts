import { describe, expect, it } from 'vitest';
import { createComposition } from '../commands/clip-engine';
import { cursorComposition, screenClip } from '../capture/screen-cursor.test-support';
import type { ZoomElement } from '../zoom/zoom-types';
import { splitRecordingClip } from './recording-split';
import { shiftTimelineSelection } from './timeline-edit-operations';
import { removeTimelineGap, timelineGaps } from './timeline-gaps';
import { zoomAtTime } from '../zoom/zoom-playback';

function recording() {
  const base = cursorComposition();
  return createComposition(
    base.assets.map((asset) => ({ ...asset, durationMs: 12000 })),
    [screenClip('screen', { timelineDurationMs: 12000, sourceDurationMs: 12000, showCursor: false })],
  );
}
const zoom = (id = 'auto', startMs = 1000, endMs = 9000, patch: Partial<ZoomElement> = {}): ZoomElement => ({
  id,
  sessionId: 'session',
  startMs,
  endMs,
  mode: 'auto',
  depth: 2,
  focus: { cx: 0.2, cy: 0.7 },
  ...patch,
});
describe('screen cuts and automatic zooms', () => {
  it('splits a crossing auto zoom and attaches each part to its own screen fragment', () => {
    const original = recording(),
      element = zoom();
    let index = 0;
    const result = splitRecordingClip(original, [element], 'screen', 5000, () => `fragment-${++index}`);
    expect(result.composition.clips.map((clip) => [clip.id, clip.timelineStartMs, clip.timelineDurationMs])).toEqual([
      ['screen', 0, 5000],
      ['fragment-1', 5000, 7000],
    ]);
    expect(result.zoomElements.map((value) => [value.id, value.startMs, value.endMs, value.linkedClipId])).toEqual([
      ['auto', 1000, 5000, 'screen'],
      ['fragment-2', 5000, 9000, 'fragment-1'],
    ]);
    expect(result.composition.clips.every((clip) => clip.kind === 'screen' && clip.showCursor === false)).toBe(true);
    expect(element).not.toHaveProperty('linkedClipId');
    expect(original.clips).toHaveLength(1);
  });
  it('moves the right zoom with its cut clip and closes the resulting gap without stretching the left zoom', () => {
    const cut = splitRecordingClip(recording(), [zoom()], 'screen', 5000);
    const right = cut.composition.clips.find((clip) => clip.timelineStartMs === 5000)!;
    const moved = shiftTimelineSelection({ ...cut, selection: { clipIds: [right.id], zoomIds: [] }, deltaMs: 3000 });
    expect(moved.zoomElements.map((value) => [value.startMs, value.endMs])).toEqual([
      [1000, 5000],
      [8000, 12000],
    ]);
    const gap = timelineGaps(moved.composition.clips)[0]!;
    const closed = removeTimelineGap(moved.composition, gap, moved.zoomElements);
    expect(closed.deltaMs).toBe(-3000);
    expect(closed.zoomElements.map((value) => [value.startMs, value.endMs])).toEqual([
      [1000, 5000],
      [5000, 9000],
    ]);
    expect(closed.composition.clips.map((clip) => clip.timelineStartMs)).toEqual([0, 5000]);
  });
  it('keeps regions wholly before or after the cut attached to the correct half without duplicating them', () => {
    const result = splitRecordingClip(
      recording(),
      [zoom('before', 1000, 2000), zoom('after', 5000, 8000)],
      'screen',
      5000,
    );
    const right = result.composition.clips.find((clip) => clip.timelineStartMs === 5000)!;
    expect(result.zoomElements.map((value) => [value.id, value.linkedClipId])).toEqual([
      ['before', 'screen'],
      ['after', right.id],
    ]);
  });
  it('preserves manual, detached and unrelated recording zooms exactly', () => {
    const input = [
      zoom('manual', 1000, 9000, { mode: 'manual' }),
      zoom('detached', 1000, 9000, { linkedClipId: null }),
      zoom('other', 1000, 9000, { sessionId: 'other' }),
    ];
    const result = splitRecordingClip(recording(), input, 'screen', 5000);
    expect(result.zoomElements).toEqual(input);
    result.zoomElements.forEach((value, index) => expect(value).toBe(input[index]));
  });
  it.each(['screen', 'zoom'])('keeps the entire cut atomic when its %s is locked', (locked) => {
    const base = recording();
    if (locked === 'screen') base.clips[0]!.locked = true;
    const elements = [zoom('auto', 1000, 9000, { locked: locked === 'zoom' })];
    const result = splitRecordingClip(base, elements, 'screen', 5000);
    expect(result.composition).toBe(base);
    expect(result.zoomElements).toEqual(elements);
  });
  it('cuts the screen and its automatic zoom when the selected clip is a grouped camera', () => {
    const base = recording();
    base.clips[0]!.groupId = 'capture';
    base.clips.push(
      screenClip('camera', {
        kind: 'webcam',
        trackId: 'camera',
        groupId: 'capture',
        timelineDurationMs: 12000,
        sourceDurationMs: 12000,
        order: 1,
      }),
    );
    const result = splitRecordingClip(createComposition(base.assets, base.clips), [zoom()], 'camera', 5000);
    expect(result.composition.clips).toHaveLength(4);
    const right = result.composition.clips.find((clip) => clip.kind === 'screen' && clip.timelineStartMs === 5000)!;
    expect(result.zoomElements.map((value) => value.linkedClipId)).toEqual(['screen', right.id]);
  });
  it('supports normal non-screen cuts without creating zoom fragments', () => {
    const base = recording();
    base.clips[0] = { ...base.clips[0]!, kind: 'video' } as (typeof base.clips)[number];
    delete (base.clips[0] as ReturnType<typeof screenClip>).showCursor;
    const result = splitRecordingClip(base, [zoom()], 'screen', 5000);
    expect(result.composition.clips).toHaveLength(2);
    expect(result.zoomElements).toEqual([zoom()]);
  });
  it.each([0, 12000, NaN])('rejects an invalid cut at %s without changing the recording', (time) => {
    const base = recording();
    expect(() => splitRecordingClip(base, [zoom()], 'screen', time)).toThrow();
    expect(base.clips).toHaveLength(1);
  });
  it('rejects unknown clips and colliding zoom fragment identities', () => {
    const base = recording();
    expect(() => splitRecordingClip(base, [zoom()], 'missing', 5000)).toThrow(/Unknown clip/);
    let i = 0;
    expect(() => splitRecordingClip(base, [zoom()], 'screen', 5000, () => (++i === 1 ? 'new-screen' : 'auto'))).toThrow(
      /Duplicate zoom/,
    );
    expect(base.clips).toHaveLength(1);
  });
  it('retains a very short zoom portion instead of extending it across the cut', () => {
    const result = splitRecordingClip(recording(), [zoom('short', 4999, 8000)], 'screen', 5000);
    expect(result.zoomElements.map((value) => [value.startMs, value.endMs])).toEqual([
      [4999, 5000],
      [5000, 8000],
    ]);
  });
  it.each([undefined, 'cinematic'] as const)(
    'keeps the zoom scale continuous at adjacent fragments with transition %s',
    (transition) => {
      const original = zoom('auto', 1000, 9000, { transition });
      const result = splitRecordingClip(recording(), [original], 'screen', 5000);
      for (const time of [4900, 5000, 5100])
        expect(zoomAtTime(result.zoomElements, time)?.scale).toBeCloseTo(zoomAtTime([original], time)!.scale, 8);
      expect(zoomAtTime(result.zoomElements, 4900)?.elementId).toBe(result.zoomElements[0]!.id);
      expect(zoomAtTime(result.zoomElements, 5000)?.elementId).toBe(result.zoomElements[1]!.id);
    },
  );
});
