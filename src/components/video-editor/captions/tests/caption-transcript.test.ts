import { describe, expect, it } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import {
  emptyComposition,
  type CaptionClip,
  type CaptionSentence,
  type ClipComposition,
} from '~/media/shared/composition-types';
import { buildCaptionTranscript, hasCaptionTranscript } from '../caption-transcript';

type TextClipOptions = Partial<Omit<CaptionClip, 'kind' | 'caption'>> & {
  sentences?: CaptionSentence[];
  customText?: string;
};

const textClip = (id: string, options: TextClipOptions = {}): CaptionClip => {
  const { sentences = [], customText, ...overrides } = options;
  const timelineDurationMs = overrides.timelineDurationMs ?? 1_000;
  const style = createDefaultCaptionStyle();
  if (customText !== undefined) style.customText = customText;

  return {
    id,
    kind: 'caption',
    name: id,
    timelineStartMs: 0,
    timelineDurationMs,
    sourceInMs: 0,
    sourceDurationMs: overrides.sourceDurationMs ?? timelineDurationMs,
    playbackRate: 1,
    enabled: true,
    order: 0,
    ...overrides,
    caption: { type: 'text', sentences, style },
  };
};

const keyboardClip = (id: string): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'keyboard',
    steps: [{ offsetMs: 0, modifiers: [], key: 'A' }],
    followCursor: false,
    recordedPlatform: 'linux',
    sourceSessionId: 'session-1',
    style: { ...createDefaultCaptionStyle(), customText: 'Keyboard overlay' },
  },
});

const sentence = (
  id: string,
  text: string,
  startMs: number,
  endMs: number,
  words: CaptionSentence['words'] = [],
): CaptionSentence => ({ id, text, startMs, endMs, words });

const compositionWith = (...clips: CaptionClip[]): ClipComposition => {
  const composition = emptyComposition();
  composition.clips = clips;
  return composition;
};

describe('caption transcript export', () => {
  it('exports every enabled text caption in chronological order with millisecond metadata', () => {
    const composition = compositionWith(
      textClip('ai', {
        timelineStartMs: 200,
        timelineDurationMs: 100,
        captionLayerId: 'shared-layer',
        isAiGenerated: true,
        sentences: [sentence('sentence-ai', 'AI words', 200, 260)],
      }),
      textClip('manual', {
        timelineStartMs: 50,
        timelineDurationMs: 120,
        sentences: [sentence('sentence-manual', 'Manual words', 100, 150)],
      }),
    );

    expect(buildCaptionTranscript(composition, 1_000)).toEqual({
      format: 'beam-transcript',
      schemaVersion: 1,
      timeUnit: 'ms',
      timelineDurationMs: 1_000,
      text: 'Manual words\nAI words',
      segments: [
        {
          clipId: 'manual',
          sentenceId: 'sentence-manual',
          captionLayerId: null,
          isAiGenerated: false,
          text: 'Manual words',
          startMs: 100,
          endMs: 150,
          words: [],
        },
        {
          clipId: 'ai',
          sentenceId: 'sentence-ai',
          captionLayerId: 'shared-layer',
          isAiGenerated: true,
          text: 'AI words',
          startMs: 200,
          endMs: 260,
          words: [],
        },
      ],
    });
    expect(hasCaptionTranscript(composition, 1_000)).toBe(true);
  });

  it('returns a valid empty transcript and reports no transcript for an empty composition', () => {
    const composition = emptyComposition();

    expect(buildCaptionTranscript(composition, 2_500)).toEqual({
      format: 'beam-transcript',
      schemaVersion: 1,
      timeUnit: 'ms',
      timelineDurationMs: 2_500,
      text: '',
      segments: [],
    });
    expect(hasCaptionTranscript(composition, 2_500)).toBe(false);
  });

  it('omits disabled, out-of-duration, empty, and keyboard captions', () => {
    const composition = compositionWith(
      textClip('disabled', {
        enabled: false,
        sentences: [sentence('disabled-sentence', 'Disabled', 0, 100)],
      }),
      textClip('after-duration', {
        timelineStartMs: 1_100,
        timelineDurationMs: 100,
        sentences: [sentence('late-sentence', 'Too late', 1_100, 1_200)],
      }),
      textClip('empty', { sentences: [sentence('blank', '  ', 0, 100)] }),
      keyboardClip('keyboard'),
    );

    expect(buildCaptionTranscript(composition, 1_000).segments).toEqual([]);
    expect(hasCaptionTranscript(composition, 1_000)).toBe(false);
  });

  it('intersects absolute sentence and word times with clip and timeline bounds without source remapping', () => {
    const composition = compositionWith(
      textClip('trimmed-slow-clip', {
        timelineStartMs: 1_000,
        timelineDurationMs: 1_000,
        sourceInMs: 7_000,
        sourceDurationMs: 2_000,
        playbackRate: 2,
        sentences: [
          sentence('sentence-1', '  Exact sentence text  ', 900, 2_100, [
            { text: 'ends-at-start', startMs: 900, endMs: 1_000 },
            { text: 'crosses-start', startMs: 950, endMs: 1_050 },
            { text: 'later-word', startMs: 1_300, endMs: 1_400 },
            { text: 'earlier-word', startMs: 1_100, endMs: 1_200 },
            { text: 'zero-duration', startMs: 1_250, endMs: 1_250 },
            { text: 'crosses-end', startMs: 1_700, endMs: 1_900 },
            { text: 'starts-at-end', startMs: 1_800, endMs: 1_900 },
          ]),
        ],
      }),
    );

    const transcript = buildCaptionTranscript(composition, 1_800);

    expect(transcript.segments).toEqual([
      {
        clipId: 'trimmed-slow-clip',
        sentenceId: 'sentence-1',
        captionLayerId: null,
        isAiGenerated: false,
        text: '  Exact sentence text  ',
        startMs: 1_000,
        endMs: 1_800,
        words: [
          { text: 'crosses-start', startMs: 1_000, endMs: 1_050 },
          { text: 'earlier-word', startMs: 1_100, endMs: 1_200 },
          { text: 'later-word', startMs: 1_300, endMs: 1_400 },
          { text: 'crosses-end', startMs: 1_700, endMs: 1_800 },
        ],
      },
    ]);
    expect(transcript.text).toBe('  Exact sentence text  ');
  });

  it('uses custom text for the full clip interval, including an empty override, and drops old words', () => {
    const composition = compositionWith(
      textClip('edited', {
        timelineStartMs: 200,
        timelineDurationMs: 300,
        customText: 'Edited text',
        isAiGenerated: true,
        sentences: [
          sentence('old-sentence', 'Old recognized text', 250, 280, [{ text: 'Old', startMs: 250, endMs: 260 }]),
        ],
      }),
      textClip('cleared', {
        timelineStartMs: 600,
        timelineDurationMs: 200,
        customText: '',
        sentences: [
          sentence('cleared-sentence', 'Hidden recognized text', 600, 700, [
            { text: 'Hidden', startMs: 600, endMs: 650 },
          ]),
        ],
      }),
    );

    expect(buildCaptionTranscript(composition, 1_000).segments).toEqual([
      {
        clipId: 'edited',
        sentenceId: null,
        captionLayerId: null,
        isAiGenerated: true,
        text: 'Edited text',
        startMs: 200,
        endMs: 500,
        words: [],
      },
    ]);
    expect(hasCaptionTranscript(composition, 1_000)).toBe(true);
  });

  it('does not mutate the composition while building or checking the transcript', () => {
    const composition = compositionWith(
      textClip('caption', {
        sentences: [sentence('sentence-1', 'Keep me', 100, 200, [{ text: 'Keep', startMs: 100, endMs: 150 }])],
      }),
    );
    const before = JSON.parse(JSON.stringify(composition));

    buildCaptionTranscript(composition, 1_000);
    hasCaptionTranscript(composition, 1_000);

    expect(composition).toEqual(before);
  });
});
