import { describe, expect, it } from 'vitest';
import { captionTextAt, isCaptionWrapEnabled, layoutCaptionText, wrapCaptionLines } from '../caption-text-layout';
import type { CaptionClip } from '../composition-types';
import { createDefaultCaptionStyle } from '../composition-defaults';

const caption = (wrap?: boolean): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [],
    style: {
      ...createDefaultCaptionStyle(20),
      color: '#fff',
      shadowColor: '#000',
      shadowBlur: 0,
      placement: 'center',
      wrap: wrap ?? true,
    },
  },
});

const measureByCharacter = (text: string) => text.length;
const measureByTenPixels = (text: string) => text.length * 10;

describe('caption text layout', () => {
  it('resolves each timed sentence at its inclusive boundaries', () => {
    const clip = caption();
    if (clip.caption.type !== 'text') throw new Error('Expected a text caption');

    clip.caption.sentences = [
      { id: 'first', text: 'First sentence', startMs: 100, endMs: 200, words: [] },
      { id: 'second', text: 'Second sentence', startMs: 300, endMs: 400, words: [] },
    ];

    expect(captionTextAt(clip, 100)).toBe('First sentence');
    expect(captionTextAt(clip, 200)).toBe('First sentence');
    expect(captionTextAt(clip, 300)).toBe('Second sentence');
    expect(captionTextAt(clip, 400)).toBe('Second sentence');
  });

  it('leaves gaps before, between, and after timed sentences empty', () => {
    const clip = caption();
    if (clip.caption.type !== 'text') throw new Error('Expected a text caption');

    clip.caption.sentences = [
      { id: 'first', text: 'First sentence', startMs: 100, endMs: 200, words: [] },
      { id: 'second', text: 'Second sentence', startMs: 300, endMs: 400, words: [] },
    ];

    expect(captionTextAt(clip, 99)).toBe('');
    expect(captionTextAt(clip, 250)).toBe('');
    expect(captionTextAt(clip, 401)).toBe('');
  });

  it('prefers custom text over timed sentences', () => {
    const clip = caption();
    if (clip.caption.type !== 'text') throw new Error('Expected a text caption');

    clip.caption.sentences = [
      { id: 'first', text: 'First sentence', startMs: 100, endMs: 200, words: [] },
      { id: 'second', text: 'Second sentence', startMs: 300, endMs: 400, words: [] },
    ];
    clip.caption.style.customText = 'Custom caption';

    expect(captionTextAt(clip, 150)).toBe('Custom caption');
    expect(captionTextAt(clip, 250)).toBe('Custom caption');
  });

  it('uses the canonical wrap setting', () => {
    expect(isCaptionWrapEnabled({ wrap: true })).toBe(true);
    expect(
      layoutCaptionText({
        clip: caption(),
        text: 'one two three',
        canvasWidth: 100,
        canvasHeight: 100,
        measureText: measureByTenPixels,
        transform: { x: 0, y: 0, width: 1, height: 0.1 },
      }),
    ).toMatchObject({ wrap: true, lines: ['one two', 'three'] });
  });

  it('keeps the single-line max-width behavior when wrapping is disabled', () => {
    const layout = layoutCaptionText({
      clip: caption(false),
      text: 'one two three',
      canvasWidth: 20,
      canvasHeight: 100,
      measureText: measureByCharacter,
      transform: { x: 0, y: 0, width: 1, height: 0.1 },
    });

    expect(layout.wrap).toBe(false);
    expect(layout.lines).toEqual(['one two three']);
    expect(layout.transform).toEqual({ x: 0, y: 0, width: 1, height: 0.1 });
  });

  it('normalizes repeated whitespace and preserves explicit blank lines', () => {
    expect(wrapCaptionLines('  alpha   beta\n\ngamma  ', 20, measureByCharacter)).toEqual(['alpha beta', '', 'gamma']);
  });

  it('breaks a word that is wider than the available text width', () => {
    expect(wrapCaptionLines('abcdefgh', 3, measureByCharacter)).toEqual(['abc', 'def', 'gh']);
  });

  it('increases the automatic text-box height as the width gets narrower', () => {
    const clip = caption(true);
    const transform = { x: 0, y: 0.4, width: 0.8, height: 0.1 };
    const wide = layoutCaptionText({
      clip,
      text: 'one two three four five six',
      canvasWidth: 200,
      canvasHeight: 100,
      measureText: (text) => text.length * 10,
      transform,
    });
    const narrow = layoutCaptionText({
      clip,
      text: 'one two three four five six',
      canvasWidth: 200,
      canvasHeight: 100,
      measureText: (text) => text.length * 10,
      transform: { ...transform, width: 0.25 },
    });

    expect(narrow.lines.length).toBeGreaterThan(wide.lines.length);
    expect(narrow.transform.height).toBeGreaterThan(wide.transform.height);
  });

  it('returns no lines and leaves the transform unchanged for empty text', () => {
    const transform = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };
    const layout = layoutCaptionText({
      clip: caption(),
      text: '',
      canvasWidth: 1920,
      canvasHeight: 1080,
      measureText: measureByCharacter,
      transform,
    });

    expect(layout.lines).toEqual([]);
    expect(layout.transform).toEqual(transform);
  });
});
