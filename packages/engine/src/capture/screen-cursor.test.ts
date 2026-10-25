import { describe, expect, it } from 'vitest';
import type { Clip, VisualClip } from '../shared/composition-types';
import { moveClip, splitClip, validateComposition } from '../commands/clip-engine';
import { screenCursorEnabled, compositionHasScreenCursor, setScreenCursorVisibility } from './screen-cursor';
import { cursorComposition, screenClip } from './screen-cursor.test-support';

describe('screen cursor visibility', () => {
  it.each([true, false])('inherits the document default %s only when the clip has no explicit choice', (enabled) => {
    expect(screenCursorEnabled(screenClip(), enabled)).toBe(enabled);
    expect(screenCursorEnabled(screenClip('on', { showCursor: true }), enabled)).toBe(true);
    expect(screenCursorEnabled(screenClip('off', { showCursor: false }), enabled)).toBe(false);
  });
  it('never enables an absent or non-screen cursor', () => {
    expect(screenCursorEnabled(null)).toBe(false);
    expect(screenCursorEnabled(undefined)).toBe(false);
    expect(screenCursorEnabled(screenClip('camera', { kind: 'webcam' }))).toBe(false);
    expect(screenCursorEnabled(screenClip())).toBe(true);
  });
  it('finds explicitly enabled clips even when the document default is off', () => {
    const composition = cursorComposition([
      screenClip('off', { showCursor: false }),
      screenClip('on', { showCursor: true, order: 1 }),
    ]);
    expect(compositionHasScreenCursor(composition, false)).toBe(true);
  });
  it('skips disabled clips, non-screen layers and empty compositions', () => {
    const composition = cursorComposition([
      screenClip('hidden', { enabled: false, showCursor: true }),
      screenClip('camera', { kind: 'webcam', order: 1 }),
    ]);
    expect(compositionHasScreenCursor(composition)).toBe(false);
    expect(compositionHasScreenCursor({ ...composition, clips: [] })).toBe(false);
  });
  it('respects both legacy defaults and explicit off clips', () => {
    const composition = cursorComposition();
    expect(compositionHasScreenCursor(composition)).toBe(true);
    expect(compositionHasScreenCursor(composition, false)).toBe(false);
    expect(compositionHasScreenCursor(setScreenCursorVisibility(composition, ['screen'], false))).toBe(false);
  });
  it('applies a mixed selection once without touching unselected clips or linked cameras', () => {
    const composition = cursorComposition([
      screenClip('a', { showCursor: true, groupId: 'capture' }),
      screenClip('b', { showCursor: false, order: 1 }),
      screenClip('untouched', { order: 2 }),
      screenClip('camera', { kind: 'webcam', groupId: 'capture', order: 3 }),
    ]);
    const next = setScreenCursorVisibility(composition, ['a', 'b', 'a', 'camera', 'missing'], true);
    expect(next.clips.map((clip) => (clip as VisualClip).showCursor)).toEqual([true, true, undefined, undefined]);
    expect(next.clips[0]).toBe(composition.clips[0]);
    expect(next.clips[2]).toBe(composition.clips[2]);
    expect(next.clips[3]).toBe(composition.clips[3]);
    expect(next.assets).toBe(composition.assets);
    expect((composition.clips[1] as VisualClip).showCursor).toBe(false);
    expect(setScreenCursorVisibility(next, ['a', 'b'], true)).toBe(next);
  });
  it.each([true, false])('copies %s at the playhead cut and edits only the chosen fragment', (enabled) => {
    const composition = cursorComposition([screenClip('screen', { showCursor: enabled })]);
    const cut = splitClip(composition, 'screen', 1000);
    expect(cut.clips.map((clip) => (clip as VisualClip).showCursor)).toEqual([enabled, enabled]);
    const right = cut.clips.find((clip) => clip.timelineStartMs === 1000)!;
    const changed = setScreenCursorVisibility(cut, [right.id], !enabled);
    const moved = moveClip(changed, right.id, 1500);
    expect(moved.clips.map((clip) => (clip as VisualClip).showCursor)).toEqual([enabled, !enabled]);
  });
  it('does not create a document revision for an empty or irrelevant selection', () => {
    const composition = cursorComposition([screenClip('video', { kind: 'video' })]);
    expect(setScreenCursorVisibility(composition, [], false)).toBe(composition);
    expect(setScreenCursorVisibility(composition, ['video', 'missing'], false)).toBe(composition);
  });
  it.each(['a', 'camera'])('rejects the whole edit when %s is locked, including linked sidecars', (lockedId) => {
    const composition = cursorComposition([
      screenClip('a', { locked: lockedId === 'a', groupId: 'capture' }),
      screenClip('b', { order: 1 }),
      screenClip('camera', { kind: 'webcam', groupId: 'capture', locked: lockedId === 'camera', order: 2 }),
    ]);
    expect(() => setScreenCursorVisibility(composition, ['a', 'b'], false)).toThrow(/locked/i);
    expect(composition.clips.every((clip) => !('showCursor' in clip))).toBe(true);
  });
  it('rejects malformed visibility without mutating the source', () => {
    const composition = cursorComposition();
    expect(() => setScreenCursorVisibility(composition, ['screen'], 'false' as unknown as boolean)).toThrow(
      /visibility/,
    );
    expect(composition.clips[0]).not.toHaveProperty('showCursor');
  });
  it.each([true, false, undefined])('validates a screen clip visibility of %s', (showCursor) => {
    const composition = cursorComposition();
    composition.clips = [{ ...composition.clips[0]!, showCursor } as Clip];
    expect(() => validateComposition(composition)).not.toThrow();
  });
  it.each([
    { kind: 'screen', showCursor: 'false' },
    { kind: 'webcam', showCursor: false },
    { kind: 'video', showCursor: true },
  ])('rejects invalid cursor fields: %j', (patch) => {
    const composition = cursorComposition();
    composition.clips = [{ ...composition.clips[0]!, ...patch } as Clip];
    expect(() => validateComposition(composition)).toThrow(/visibility/);
  });
});
