import { describe, expect, it } from 'vitest';
import { sentencesFromWords } from '../useWhisperTranscription';

describe('sentencesFromWords', () => {
  it('keeps word timing and ends a sentence on punctuation', () => {
    const sentences = sentencesFromWords([
      { text: 'Hello', startMs: 0, endMs: 200 },
      { text: 'world.', startMs: 210, endMs: 500 },
    ]);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toMatchObject({
      text: 'Hello world.',
      startMs: 0,
      endMs: 500,
    });
  });
  it('splits long unpunctuated transcripts into editable phrases', () => {
    const words = Array.from({ length: 13 }, (_, index) => ({
      text: `w${index}`,
      startMs: index * 100,
      endMs: index * 100 + 50,
    }));
    expect(sentencesFromWords(words).map((sentence) => sentence.words.length)).toEqual([12, 1]);
  });
  it('prevents an imprecise word timestamp from overlapping the next caption', () => {
    const sentences = sentencesFromWords([
      { text: 'First.', startMs: 0, endMs: 600 },
      { text: 'Next.', startMs: 500, endMs: 900 },
    ]);
    expect(sentences.map((sentence) => [sentence.startMs, sentence.endMs])).toEqual([
      [0, 500],
      [500, 900],
    ]);
  });
  it('returns no phrases when Whisper returns no words', () => expect(sentencesFromWords([])).toEqual([]));
});
