import { describe, expect, it } from 'vitest';
import { prepareSplitZoomContinuity } from '../zoom-split-continuity';
import type { ZoomElement } from '../zoom-types';
const part = (id: string, startMs: number, endMs: number, patch: Partial<ZoomElement> = {}): ZoomElement => ({
  id,
  startMs,
  endMs,
  linkedClipId: `screen-${id}`,
  splitGroupId: 'original',
  sessionId: 'session',
  focus: { cx: 0.2, cy: 0.4 },
  depth: 2,
  mode: 'auto',
  ...patch,
});
describe('zoom envelope continuity after a recording cut', () => {
  it('borrows regular zoom input and preserves absent identifiers without adding a runtime group', () => {
    const elements = [part('regular', 0, 3000, { splitGroupId: undefined })];
    const result = prepareSplitZoomContinuity(elements);
    expect(result.elements).toBe(elements);
    expect(result.elementIdAt(undefined, 0)).toBeUndefined();
    expect(result.elementIdAt('missing', 0)).toBe('missing');
  });
  it('joins adjacent fragments for playback while reporting each original clip-owned region at the cut', () => {
    const elements = [part('a', 1000, 2000), part('b', 2000, 3000), part('c', 3000, 4000)];
    const result = prepareSplitZoomContinuity(elements);
    expect(result.elements).toEqual([{ ...elements[0], endMs: 4000 }]);
    for (const [time, id] of [
      [0, 'a'],
      [1999, 'a'],
      [2000, 'b'],
      [2999, 'b'],
      [3000, 'c'],
      [9000, 'c'],
    ] as const)
      expect(result.elementIdAt('a', time)).toBe(id);
    expect(elements[0]!.endMs).toBe(2000);
  });
  it.each([
    { splitGroupId: 'other' },
    { startMs: 2100 },
    { depth: 3 },
    { focus: { cx: 0.8, cy: 0.4 } },
    { mode: 'manual' },
    { enabled: false },
  ] as Partial<ZoomElement>[])('keeps separated or edited parts independent: %j', (patch) => {
    const elements = [part('a', 1000, 2000), part('b', 2000, 3000, patch)];
    expect(prepareSplitZoomContinuity(elements).elements).toBe(elements);
  });
  it('does not join equal-looking automatic zooms without cut provenance', () => {
    const elements = [
      part('a', 1000, 2000, { splitGroupId: undefined }),
      part('b', 2000, 3000, { splitGroupId: undefined }),
    ];
    expect(prepareSplitZoomContinuity(elements).elements).toBe(elements);
    expect(prepareSplitZoomContinuity([]).elements).toEqual([]);
  });
  it('keeps ordinary zooms and unresolved identities unchanged beside actual cut fragments', () => {
    const ordinary = part('ordinary', 0, 500, { splitGroupId: undefined });
    const result = prepareSplitZoomContinuity([ordinary, part('a', 1000, 2000), part('b', 2000, 3000)]);
    expect(result.elements[0]).toBe(ordinary);
    expect(result.elementIdAt(undefined, 1200)).toBeUndefined();
    expect(result.elementIdAt('missing', 1200)).toBe('missing');
  });
});
