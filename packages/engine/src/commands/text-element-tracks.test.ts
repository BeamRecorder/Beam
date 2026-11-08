import { describe, expect, it } from 'vitest';
import { findTextElementTrack, isTextElementClip } from './text-element-tracks';
import { textComposition, textElement } from './tests/text-element-fixtures';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';

describe('text element tracks', () => {
  it.each([0, 2000])('reuses a lane immediately before or after another text at %s ms', (start) => {
    const existing = textElement('existing', 1000, 'lane');
    const composition = textComposition([existing]);
    expect(findTextElementTrack(composition, [textElement('next', start)])).toBe(existing);
    expect(composition.clips).toEqual([existing]);
  });
  it('fits into a gap only when every incoming fragment fits', () => {
    const first = textElement('first', 0, 'lane'),
      last = textElement('last', 3000, 'lane');
    const composition = textComposition([first, last]);
    expect(findTextElementTrack(composition, [textElement('a', 1000), textElement('b', 2000)])).toBe(first);
    expect(findTextElementTrack(composition, [textElement('a', 1000), textElement('b', 2500)])).toBeNull();
  });
  it.each([false, true])('does not reuse occupied intervals even when disabled=%s', (disabled) => {
    const existing = textElement('existing', 0, 'lane', { enabled: !disabled });
    expect(findTextElementTrack(textComposition([existing]), [textElement('new', 500)])).toBeNull();
  });
  it('skips locked tracks and tracks mixing text with other elements', () => {
    const first = textElement('first', 0, 'locked');
    const locked = textElement('locked-fragment', 3000, 'locked', { locked: true });
    const text = textElement('text', 0, 'mixed');
    const shape = textElement('shape', 3000, 'mixed', { family: 'shape', preset: 'rectangle' });
    expect(findTextElementTrack(textComposition([first, locked, text, shape]), [textElement('next', 1000)])).toBeNull();
  });
  it('prefers the selected/source track, then the nearest available track', () => {
    const nearest = textElement('nearest', 2000, 'near', { order: 2 });
    const far = textElement('far', 0, 'far', { order: 1 });
    const other = textElement('other', 0, 'other', { order: 0 });
    const composition = textComposition([nearest, far, other]);
    expect(findTextElementTrack(composition, [textElement('next', 4000)], 'far')).toBe(far);
    expect(findTextElementTrack(composition, [textElement('next', 4000)])).toBe(nearest);
    expect(findTextElementTrack(composition, [textElement('next', 4000)], 'near', new Set(['near']))).toBe(other);
  });
  it('uses stable clip IDs when candidates have the same distance and order', () => {
    const a = textElement('a'),
      b = textElement('b');
    expect(findTextElementTrack(textComposition([b, a]), [textElement('next', 1000)])).toBe(a);
  });
  it('ignores unrelated clips, missing tracks and invalid incoming groups', () => {
    const missing = textElement('missing', 0, undefined, { trackId: undefined });
    const composition = textComposition([colorClip('color'), missing]);
    expect(findTextElementTrack(composition, [textElement('next', 1000)])).toBeNull();
    expect(findTextElementTrack(composition, [])).toBeNull();
    expect(findTextElementTrack(composition, [textElement('shape', 0, 'shape', { family: 'shape' })])).toBeNull();
    expect(isTextElementClip(colorClip('color'))).toBe(false);
  });
});
