import { describe, expect, it } from 'vitest';
import { preservesLockedOrder } from './timeline-lock-order';
import { preservesLockedItems } from './timeline-locks';
import type { LockableTimelineItem } from './timeline-lock-types';

const check = (before: LockableTimelineItem[], after: LockableTimelineItem[]) =>
  preservesLockedOrder(before, new Map(after.map((item) => [item.id, item])));
const pairwise = (before: LockableTimelineItem[], after: LockableTimelineItem[]) => {
  const next = new Map(after.map((item) => [item.id, item]));
  return before
    .filter((item) => item.locked)
    .every((item) => {
      const replacement = next.get(item.id);
      if (!replacement) return false;
      return before.every((other) => {
        const otherNext = next.get(other.id);
        return (
          !otherNext ||
          item.order === undefined ||
          replacement.order === undefined ||
          other.order === undefined ||
          otherNext.order === undefined ||
          Math.sign(item.order - other.order) === Math.sign(replacement.order - otherNext.order)
        );
      });
    });
};

describe('indexed lock ordering', () => {
  it('preserves ties while rejecting a split tie or a new tie across locked layers', () => {
    const before = [
      { id: 'lock', order: 3, locked: true },
      { id: 'free', order: 3 },
    ];
    expect(
      check(
        before,
        before.map((item) => ({ ...item, order: 50 })),
      ),
    ).toBe(true);
    expect(check(before, [before[0]!, { id: 'free', order: 4 }])).toBe(false);
    const distinct = [before[0]!, { id: 'free', order: 4 }];
    expect(check(distinct, before)).toBe(false);
    expect(check(distinct, [before[0]!, { id: 'free', order: -1 }])).toBe(false);
  });
  it('allows unlocked reorders within the same side, deletions, new IDs and unordered items', () => {
    const before = [
      { id: 'lock', order: 5, locked: true },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
      { id: 'unordered' },
    ];
    expect(check(before, [before[0]!, { id: 'a', order: 4 }, { id: 'b', order: 0 }, { id: 'new', order: 100 }])).toBe(
      true,
    );
    expect(
      check(before, [
        { id: 'lock', locked: true },
        { id: 'b', order: 100 },
      ]),
    ).toBe(true);
    expect(check([{ id: 'lock', locked: true }], [{ id: 'lock', order: 1 }])).toBe(true);
    expect(check([], [])).toBe(true);
    expect(preservesLockedItems(before, [{ id: 'a' }])).toBe(false);
  });
  it('retains comparison behavior at non-finite boundaries instead of letting NaN bypass a lock', () => {
    const orders = [undefined, -Infinity, -1, 0, 1, Infinity, NaN];
    for (const lockOrder of orders)
      for (const freeOrder of orders)
        for (const nextOrder of orders) {
          const before = [
            { id: 'lock', order: lockOrder, locked: true },
            { id: 'free', order: freeOrder },
          ];
          const after = [
            { id: 'lock', order: lockOrder, locked: false },
            { id: 'free', order: nextOrder },
          ];
          expect(check(before, after)).toBe(pairwise(before, after));
        }
  });
  it('matches the original pairwise contract across 10000 adversarial edits', () => {
    let seed = 67318;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let attempt = 0; attempt < 10000; attempt++) {
      const before: LockableTimelineItem[] = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        locked: random() < 0.4,
        order: random() < 0.1 ? undefined : Math.floor(random() * 8) - 4,
      }));
      const after = before.flatMap((item) =>
        !item.locked && random() < 0.15
          ? []
          : [
              {
                ...item,
                locked: random() < 0.5,
                order:
                  random() < 0.15 ? undefined : attempt % 2 ? (item.order ?? 0) * 3 + 50 : Math.floor(random() * 8),
              },
            ],
      );
      expect(preservesLockedItems(before, after)).toBe(pairwise(before, after));
    }
  });
  it('handles ten thousand protected layers with a bounded number of order reads', () => {
    let reads = 0;
    const before = Array.from({ length: 10000 }, (_, i) => ({
      id: `${i}`,
      locked: true,
      get order() {
        reads++;
        return i;
      },
    }));
    const after = before.map((item, i) => ({ id: item.id, locked: true, order: i * 2 + 100 }));
    expect(preservesLockedItems(before, after)).toBe(true);
    expect(reads).toBeLessThan(100000);
  });
});
