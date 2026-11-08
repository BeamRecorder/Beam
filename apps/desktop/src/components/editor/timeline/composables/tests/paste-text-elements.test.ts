import { describe, expect, it } from 'vitest';
import { textComposition, textElement } from '@beam/engine/commands/tests/text-element-fixtures';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { createComposition } from '@beam/engine/commands/clip-engine';
import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { TimelineClipboardItem } from '../timeline-clipboard-types';
import { pasteTimelineClipboard } from '../paste-timeline-clipboard';

const itemFor = (clips: ShapeClip[]): TimelineClipboardItem => ({
  type: 'selection',
  scopeId: 'project',
  anchorTimeMs: Math.min(...clips.map((c) => c.timelineStartMs)),
  primaryIndex: 0,
  entries: clips.map((clip) => ({
    type: 'clip',
    category: 'visual',
    clip,
    asset: null,
    descriptor: { kind: 'item', name: clip.name },
  })),
  descriptor: { kind: 'selection', items: clips.map((clip) => ({ kind: 'item', name: clip.name })) },
});
const paste = (clips: ShapeClip[], copies: ShapeClip[], timeMs: number, placement: 'auto' | 'new-layer' = 'auto') => {
  let next = 0;
  return pasteTimelineClipboard({
    composition: createComposition([], clips),
    zoomElements: [],
    item: itemFor(copies),
    timeMs,
    timelineDurationMs: 10000,
    target: { category: 'visual', placement },
    idFactory: () => `copy-${++next}`,
  });
};

describe('paste text elements', () => {
  it('keeps repeated sequential pastes on the same track with their original text settings', () => {
    const original = textElement('original', 0, 'text-track');
    const item = itemFor([original]);
    let composition = textComposition([original]);
    let next = 0;
    for (const timeMs of [1000, 2000, 3000]) {
      const result = pasteTimelineClipboard({
        composition,
        zoomElements: [],
        item,
        timeMs,
        timelineDurationMs: 10000,
        target: { category: 'visual', placement: 'auto' },
        idFactory: () => `copy-${++next}`,
      });
      composition = result.composition;
      expect(composition.clips.find((clip) => clip.id === result.clipIds[0])).toMatchObject({
        trackId: 'text-track',
        text: original.text,
      });
    }
    expect(composition.clips).toHaveLength(4);
    expect(new Set(composition.clips.map((c) => c.trackId)).size).toBe(1);
    expect(composition.clips.map((c) => c.timelineStartMs)).toEqual([0, 1000, 2000, 3000]);
  });
  it('uses a separate track for an overlapping paste without trimming the original', () => {
    const original = textElement('original', 0, 'text-track');
    const result = paste([original], [original], 500);
    expect(result.composition.clips.find((c) => c.id === original.id)).toEqual(original);
    expect(result.composition.clips.find((c) => c.id === result.clipIds[0])?.trackId).not.toBe(original.trackId);
    expect(result.composition.clips).toHaveLength(2);
  });
  it('reuses a lane for every fragment in a copied text sequence', () => {
    const first = textElement('first', 0, 'lane'),
      second = textElement('second', 2000, 'lane');
    const result = paste([first, second], [first, second], 3000);
    expect(
      result.composition.clips.filter((c) => result.clipIds.includes(c.id)).map((c) => [c.trackId, c.timelineStartMs]),
    ).toEqual([
      ['lane', 3000],
      ['lane', 5000],
    ]);
  });
  it('preserves distinct source layers in a multi-track bundle', () => {
    const first = textElement('first', 0, 'lane-a'),
      second = textElement('second', 0, 'lane-b', { order: 1 });
    const result = paste([first, second], [first, second], 1000);
    expect(result.composition.clips.filter((c) => result.clipIds.includes(c.id)).map((c) => c.trackId)).toEqual([
      'lane-a',
      'lane-b',
    ]);
  });

  it('keeps a mixed text-and-shape bundle separate from existing text-only tracks', () => {
    const text = textElement('text', 0, 'mixed');
    const shape = textElement(
      'shape',
      2000,
      'mixed',
      normalizeShapeLayerStyle({ family: 'shape', preset: 'rectangle' }),
    );
    const existing = textElement('existing', 0, 'text-only', { order: 1 });
    const result = paste([text, shape, existing], [text, shape], 3000);
    const copies = result.composition.clips.filter((c) => result.clipIds.includes(c.id));
    expect(new Set(copies.map((c) => c.trackId)).size).toBe(1);
    expect(copies[0]?.trackId).not.toBe('text-only');
    expect(copies[0]?.trackId).not.toBe('mixed');
    expect(result.composition.clips.filter((c) => c.trackId === 'text-only')).toHaveLength(1);
  });

  it('never reuses a locked text track and honors an explicit new-layer paste', () => {
    const original = textElement('original', 0, 'lane');
    const locked = { ...original, locked: true };
    const result = paste([locked], [original], 1000);
    expect(result.composition.clips.find((c) => c.id === result.clipIds[0])?.trackId).not.toBe('lane');
    expect(result.composition.clips.find((c) => c.id === locked.id)?.locked).toBe(true);
    const explicit = paste([original], [original], 1000, 'new-layer');
    expect(explicit.composition.clips.find((c) => c.id === explicit.clipIds[0])?.trackId).not.toBe('lane');
  });
});
