import { describe, expect, it } from 'vitest';
import { timelineDocument, playheadAt } from '../src/timeline-model';
import { COMPOSITION_SCHEMA_VERSION } from '../../../packages/engine/src/shared/composition-types';

describe('real Beam timeline document', () => {
  it('uses the actual engine schema and a local render of the authored HTML', () => {
    const doc = timelineDocument();
    expect(doc.schemaVersion).toBe(COMPOSITION_SCHEMA_VERSION);
    expect(doc.assets[0]).toMatchObject({ kind: 'video', name: 'scene.html', durationMs: 12000 });
    expect(doc.assets[0]!.src).toContain('html-source.mp4');
    expect(doc.clips[0]).toMatchObject({
      kind: 'video',
      assetId: doc.assets[0]!.id,
      sourceInMs: 0,
      timelineStartMs: 0,
      sourceDurationMs: 12000,
      timelineDurationMs: 12000,
      playbackRate: 1,
      enabled: true,
    });
  });
  it('keeps presentation state independent of another movie render', () => {
    const first = timelineDocument();
    first.clips[0]!.name = 'Changed';
    expect(timelineDocument().clips[0]!.name).toBe('scene.html');
  });
  it('contains one authored visual source and no fabricated audio', () => {
    const doc = timelineDocument();
    expect(doc.assets).toHaveLength(1);
    expect(doc.clips).toHaveLength(1);
    expect(doc.keyboardCaptionSessions).toEqual([]);
    expect(doc.clips.filter((clip) => clip.kind === 'audio')).toHaveLength(0);
  });
});
describe('timeline loop clock', () => {
  it.each([
    [0, 0],
    [3.15, 3.15],
    [10.7, 10.7],
    [11.25, 5.35],
    [11.8, 0],
    [12, 0],
    [-1, 0],
    [13, 0],
  ])('maps %s to %s', (time, expected) => expect(playheadAt(time)).toBeCloseTo(expected));
  it.each([NaN, Infinity, -Infinity])('rejects non-finite input', (time) =>
    expect(() => playheadAt(time)).toThrow(TypeError),
  );
});
