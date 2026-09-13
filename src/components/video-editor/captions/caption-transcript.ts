import { isTextCaptionClip, type ClipComposition } from '~/media/shared/composition-types';
import type { CaptionTranscript, TranscriptSegment } from '~/api/types/transcript';

function* transcriptSegments(composition: ClipComposition, durationMs: number): Generator<TranscriptSegment> {
  for (const clip of composition.clips) {
    if (!isTextCaptionClip(clip) || !clip.enabled) continue;
    const clipStart = Math.max(0, clip.timelineStartMs);
    const clipEnd = Math.min(durationMs, clip.timelineStartMs + clip.timelineDurationMs);
    if (clipEnd <= clipStart) continue;
    const identity = {
      clipId: clip.id,
      captionLayerId: clip.captionLayerId ?? null,
      isAiGenerated: clip.isAiGenerated === true,
    };
    const custom = clip.caption.style.customText;
    if (custom !== undefined) {
      // Edited text no longer has a reliable alignment with the original recognized words.
      if (custom.trim())
        yield { ...identity, sentenceId: null, text: custom, startMs: clipStart, endMs: clipEnd, words: [] };
      continue;
    }
    for (const sentence of clip.caption.sentences) {
      // Caption rendering reads absolute timeline timestamps, without sourceIn/playbackRate remapping.
      const startMs = Math.max(clipStart, sentence.startMs);
      const endMs = Math.min(clipEnd, sentence.endMs);
      if (!sentence.text.trim() || endMs <= startMs) continue;
      const words = sentence.words
        .filter((word) => word.text.trim() && word.endMs > word.startMs && word.endMs > startMs && word.startMs < endMs)
        .map((word) => ({
          text: word.text,
          startMs: Math.max(startMs, word.startMs),
          endMs: Math.min(endMs, word.endMs),
        }))
        .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
      yield { ...identity, sentenceId: sentence.id, text: sentence.text, startMs, endMs, words };
    }
  }
}

export function hasCaptionTranscript(composition: ClipComposition, durationMs: number): boolean {
  return !transcriptSegments(composition, durationMs).next().done;
}

export function buildCaptionTranscript(composition: ClipComposition, durationMs: number): CaptionTranscript {
  const segments = [...transcriptSegments(composition, durationMs)].sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs,
  );
  return {
    format: 'beam-transcript',
    schemaVersion: 1,
    timeUnit: 'ms',
    timelineDurationMs: durationMs,
    text: segments.map((segment) => segment.text).join('\n'),
    segments,
  };
}
