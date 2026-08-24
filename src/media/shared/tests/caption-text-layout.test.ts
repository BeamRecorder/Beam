import { describe, expect, it } from 'vitest';
import {
  captionContentAt,
  captionTextAt,
  isCaptionWrapEnabled,
  layoutCaptionText,
  wrapCaptionHighlightLines,
  wrapCaptionLines,
} from '../caption-text-layout';
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

const timedCaption = () => {
  const clip = caption();
  if (clip.caption.type !== 'text') throw new Error('Expected a text caption');

  clip.caption.style.wordHighlight = {
    ...clip.caption.style.wordHighlight,
    enabled: true,
    displayMode: 'sentence',
  };
  clip.caption.sentences = [
    {
      id: 'timed',
      text: 'Hello world',
      startMs: 100,
      endMs: 300,
      words: [
        { text: 'Hello', startMs: 100, endMs: 180 },
        { text: 'world', startMs: 200, endMs: 300 },
      ],
    },
  ];
  return clip;
};

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

  it('keeps an empty custom text override empty in layout and disables AI word highlighting', () => {
    const clip = timedCaption();
    if (clip.caption.type !== 'text') throw new Error('Expected a text caption');

    clip.isAiGenerated = true;
    clip.caption.style.customText = '';
    const transform = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };
    const textAtSentence = captionTextAt(clip, 120);
    const textBetweenSentences = captionTextAt(clip, 320);
    const layout = layoutCaptionText({
      clip,
      text: textAtSentence,
      canvasWidth: 1_920,
      canvasHeight: 1_080,
      measureText: measureByCharacter,
      transform,
    });

    expect(textAtSentence).toBe('');
    expect(textBetweenSentences).toBe('');
    expect(layout.lines).toEqual([]);
    expect(layout.transform).toEqual(transform);
    expect(captionContentAt(clip, 120)).toEqual({ text: '', runs: null, wordHighlight: null });
  });

  it('resolves active words with half-open boundaries and leaves timing gaps unhighlighted', () => {
    const clip = timedCaption();

    const atStart = captionContentAt(clip, 100);
    expect(atStart.text).toBe('Hello world');
    expect(atStart.wordHighlight?.words).toEqual([
      { text: 'Hello', active: true, progress: 0 },
      { text: 'world', active: false, progress: 0 },
    ]);

    const atFirstEnd = captionContentAt(clip, 180);
    expect(atFirstEnd.text).toBe('Hello world');
    expect(atFirstEnd.wordHighlight?.words.every((word) => !word.active)).toBe(true);

    const atSecondStart = captionContentAt(clip, 200);
    expect(atSecondStart.wordHighlight?.words).toEqual([
      { text: 'Hello', active: false, progress: 0 },
      { text: 'world', active: true, progress: 0 },
    ]);

    const atSentenceEnd = captionContentAt(clip, 300);
    expect(atSentenceEnd.text).toBe('Hello world');
    expect(atSentenceEnd.wordHighlight?.words.every((word) => !word.active)).toBe(true);
  });

  it('shows only the active word in word display mode and hides timing gaps', () => {
    const clip = timedCaption();
    if (clip.caption.type !== 'text') throw new Error('Expected a text caption');
    clip.caption.style.wordHighlight = {
      ...clip.caption.style.wordHighlight,
      displayMode: 'word',
    };

    expect(captionContentAt(clip, 120)).toMatchObject({
      text: 'Hello',
      wordHighlight: { words: [{ text: 'Hello', active: true }] },
    });
    expect(captionContentAt(clip, 180)).toEqual({ text: '', runs: null, wordHighlight: null });
    expect(captionContentAt(clip, 220)).toMatchObject({
      text: 'world',
      wordHighlight: { words: [{ text: 'world', active: true }] },
    });
  });

  it('falls back to ordinary text when highlighting is disabled, custom text is present, or words are missing', () => {
    const disabled = timedCaption();
    if (disabled.caption.type !== 'text') throw new Error('Expected a text caption');
    disabled.caption.style.wordHighlight.enabled = false;
    expect(captionContentAt(disabled, 120)).toEqual({
      text: 'Hello world',
      runs: null,
      wordHighlight: null,
    });

    const customText = timedCaption();
    if (customText.caption.type !== 'text') throw new Error('Expected a text caption');
    customText.caption.style.customText = 'Custom caption';
    expect(captionContentAt(customText, 120)).toEqual({
      text: 'Custom caption',
      runs: null,
      wordHighlight: null,
    });

    const withoutWords = timedCaption();
    if (withoutWords.caption.type !== 'text') throw new Error('Expected a text caption');
    withoutWords.caption.sentences[0]!.words = [];
    expect(captionContentAt(withoutWords, 120)).toEqual({
      text: 'Hello world',
      runs: null,
      wordHighlight: null,
    });
  });

  it('wraps highlighted words without losing active state or long-word fragments', () => {
    const lines = wrapCaptionHighlightLines(
      [
        { text: 'one', active: false, progress: 0 },
        { text: 'two', active: true, progress: 0.5 },
        { text: 'three', active: false, progress: 0 },
      ],
      7,
      measureByCharacter,
    );

    expect(lines.map((line) => line.map((word) => word.text))).toEqual([['one', 'two'], ['three']]);
    expect(lines[0]?.[1]).toMatchObject({ text: 'two', active: true, progress: 0.5 });

    const longWordLines = wrapCaptionHighlightLines(
      [{ text: 'abcdef', active: true, progress: 0.25 }],
      3,
      measureByCharacter,
    );
    expect(longWordLines.map((line) => line.map((word) => word.text))).toEqual([['abc'], ['def']]);
    expect(longWordLines.flat().every((word) => word.active && word.progress === 0.25)).toBe(true);
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
