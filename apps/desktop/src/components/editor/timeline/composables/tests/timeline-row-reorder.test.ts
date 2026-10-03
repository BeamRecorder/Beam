import { describe, expect, it } from 'vitest';
import { createTimelineRowReorder } from '../timeline-row-reorder';

describe('prepared timeline row reordering', () => {
  const rows = ['a', 'b', 'c'].map((id) => ({ id, clips: [{}] }));
  it('moves in both directions without mutating the authored order', () => {
    const reorder = createTimelineRowReorder(rows),
      order = rows.map((row) => row.id);
    expect(reorder(order, 'a', 'c', 0.5)).toEqual(['b', 'c', 'a']);
    expect(reorder(order, 'c', 'a', 0.5)).toEqual(['c', 'a', 'b']);
    expect(order).toEqual(['a', 'b', 'c']);
  });
  it('rejects empty, missing and unchanged targets', () => {
    const reorder = createTimelineRowReorder([]);
    expect(reorder([], 'a', 'b')).toBeNull();
    expect(reorder(['a', 'b'], 'a', 'missing')).toBeNull();
    expect(reorder(['a'], 'a', 'a')).toBeNull();
  });
  it('uses spatial hysteresis at both boundaries and accepts unmeasured rows', () => {
    const reorder = createTimelineRowReorder(rows),
      order = rows.map((row) => row.id);
    expect(reorder(order, 'a', 'b', 0.349)).toBeNull();
    expect(reorder(order, 'b', 'a', 0.651)).toBeNull();
    expect(reorder(order, 'a', 'b', 0.35)).toEqual(['b', 'a', 'c']);
    expect(reorder(order, 'b', 'a', 0.65)).toEqual(['b', 'a', 'c']);
    expect(reorder(order, 'a', 'c')).toEqual(['b', 'c', 'a']);
  });
  it('allows successive swaps in the same millisecond while preventing all locked crossings', () => {
    const reorder = createTimelineRowReorder(rows);
    const first = reorder(['a', 'b', 'c'], 'a', 'b')!;
    expect(reorder(first, 'a', 'c')).toEqual(['b', 'c', 'a']);
    const guarded = createTimelineRowReorder([
      { ...rows[0]!, clips: [] },
      { ...rows[1]!, clips: [{ locked: true }] },
      rows[2]!,
    ]);
    expect(guarded(['a', 'b', 'c'], 'a', 'c')).toBeNull();
    expect(guarded(['a', 'b', 'c'], 'c', 'a')).toBeNull();
    expect(guarded(['a', 'b', 'c'], 'b', 'c')).toBeNull();
  });
  it('reads lock state once for a 10000-row gesture rather than once per pointer frame', () => {
    let reads = 0;
    const many = Array.from({ length: 10000 }, (_, index) => ({
      id: String(index),
      clips: [
        {
          get locked() {
            reads++;
            return index === 9000;
          },
        },
      ],
    }));
    const reorder = createTimelineRowReorder(many);
    let order = many.map((row) => row.id);
    for (let index = 1; index <= 100; index++) order = reorder(order, '0', String(index))!;
    expect(order[100]).toBe('0');
    expect(reads).toBe(10000);
    expect(reorder(order, '0', '9999')).toBeNull();
  });
});
