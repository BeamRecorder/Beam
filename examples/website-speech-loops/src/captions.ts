import { createDefaultCaptionStyle } from '../../../packages/engine/src/shared/composition-defaults';
import { captionContentAt } from '../../../packages/engine/src/shared/caption-text-layout';
import { drawCaptionText } from '../../../packages/runtime/src/composition/captions/render-caption-text';
import type { CaptionClip } from '@beam/engine/shared/composition-types';
import { captionState } from './motion';

export const SENTENCES = [
  { text: 'Every word, beautifully clear.', start: 0, end: 2400 },
  { text: 'Make your story stand out.', start: 2400, end: 5000 },
  { text: 'Created with Beam.', start: 5000, end: 8000 },
];
export function captionClip(time: number): CaptionClip {
  const state = captionState(time),
    defaults = createDefaultCaptionStyle(state.fontSize);
  return {
    id: 'caption',
    kind: 'caption',
    name: 'Captions',
    enabled: true,
    order: 0,
    timelineStartMs: 0,
    timelineDurationMs: 8000,
    sourceInMs: 0,
    sourceDurationMs: 8000,
    playbackRate: 1,
    transform: { x: 0.08, y: 0.3, width: 0.84, height: 0.4 },
    caption: {
      type: 'text',
      sentences: SENTENCES.map((sentence, index) => {
        const words = sentence.text.split(' '),
          step = (sentence.end - sentence.start) / words.length;
        return {
          id: `sentence-${index}`,
          text: sentence.text,
          startMs: sentence.start,
          endMs: sentence.end,
          words: words.map((text, word) => ({
            text,
            startMs: sentence.start + word * step,
            endMs: sentence.start + (word + 1) * step,
          })),
        };
      }),
      style: {
        ...defaults,
        fontFamily: 'Hanken Grotesk',
        fontWeight: 800,
        outlineWidth: 0,
        extrusionDepth: 0,
        shadowBlur: 8,
        placement: 'center',
        shape: {
          ...defaults.shape,
          opacity: state.background ? 65 : 0,
          blur: 0,
          padding: 22,
        },
        wordHighlight: {
          ...defaults.wordHighlight,
          enabled: state.highlight,
          color: '#ffd29c',
          inactiveOpacity: 85,
          effect: 'pop',
        },
      },
    },
  };
}
export function paintCaption(context: CanvasRenderingContext2D, time: number) {
  const state = captionState(time);
  if (!state.generated) return;
  const clip = captionClip(time),
    content = captionContentAt(clip, state.playheadMs);
  drawCaptionText(context, {
    clip,
    ...content,
    canvas: { width: 1280, height: 800 },
    viewport: {
      x: 0,
      y: 0,
      width: context.canvas.width,
      height: context.canvas.height,
    },
  });
}
