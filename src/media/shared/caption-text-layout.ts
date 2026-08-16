import type { CaptionClip, CaptionStyle, NormalizedTransform } from './composition-types';
import { getCaptionTransform } from './composition-types';
import { keyboardCaptionRunsAt, type KeyboardCaptionRun } from './keyboard-captions';

export const CAPTION_LINE_HEIGHT = 1.2;
export const CAPTION_HORIZONTAL_INSET = 8;
export const CAPTION_VERTICAL_INSET = 4;

export type CaptionTextMeasurer = (text: string, fontSize: number, style?: CaptionStyle) => number;

export interface CaptionTextLayout {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  maxTextWidth: number;
  transform: NormalizedTransform;
  wrap: boolean;
}

export const isCaptionWrapEnabled = (style: Pick<CaptionStyle, 'wrap'>) => style.wrap;

export function captionTextAt(clip: CaptionClip, timeMs: number): string {
  if (clip.caption.style.customText) return clip.caption.style.customText;
  if (clip.caption.type === 'keyboard')
    return keyboardCaptionRunsAt(clip, timeMs)
      .map((run) => run.text)
      .join('');
  return clip.caption.sentences.find((sentence) => sentence.startMs <= timeMs && timeMs <= sentence.endMs)?.text ?? '';
}

export function captionContentAt(
  clip: CaptionClip,
  timeMs: number,
): { text: string; runs: KeyboardCaptionRun[] | null } {
  if (clip.caption.type !== 'keyboard') return { text: captionTextAt(clip, timeMs), runs: null };
  const runs = keyboardCaptionRunsAt(clip, timeMs);
  return { text: runs.map((run) => run.text).join(''), runs };
}

export const approximateCaptionTextWidth: CaptionTextMeasurer = (text, fontSize, style) =>
  Array.from(text).reduce((width, character) => width + (character === ' ' ? 0.33 : 0.6) * fontSize, 0) +
  Math.max(0, Array.from(text).length - 1) * (style?.letterSpacing ?? 0);

const splitLongWord = (word: string, maxWidth: number, measure: (text: string) => number) => {
  const chunks: string[] = [];
  let chunk = '';
  for (const character of Array.from(word)) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else chunk = candidate;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
};

export function wrapCaptionLines(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  if (!text) return [];
  const width = Math.max(1, maxWidth);
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      const chunks = splitLongWord(word, width, measure);
      if (chunks.length > 1) lines.push(...chunks.slice(0, -1));
      line = chunks.at(-1) ?? '';
    }
    lines.push(line);
  }
  return lines;
}

export function layoutCaptionText(options: {
  clip: CaptionClip;
  text: string;
  canvasWidth: number;
  canvasHeight: number;
  measureText?: CaptionTextMeasurer;
  transform?: NormalizedTransform;
}): CaptionTextLayout {
  const fontSize = Math.max(1, options.clip.caption.style.fontSize);
  const wrap = isCaptionWrapEnabled(options.clip.caption.style);
  const transform = options.transform ?? getCaptionTransform(options.clip);
  const maxTextWidth = Math.max(1, transform.width * Math.max(1, options.canvasWidth) - CAPTION_HORIZONTAL_INSET * 2);
  const measureText = options.measureText ?? approximateCaptionTextWidth;
  const lines = wrap
    ? wrapCaptionLines(options.text, maxTextWidth, (text) => measureText(text, fontSize, options.clip.caption.style))
    : options.text
      ? [options.text]
      : [];
  const lineHeight = fontSize * (options.clip.caption.style.lineHeight ?? CAPTION_LINE_HEIGHT);
  if (!wrap || !lines.length) return { fontSize, lineHeight, lines, maxTextWidth, transform, wrap };
  const height = Math.min(
    4,
    Math.max(0.02, (lines.length * lineHeight + CAPTION_VERTICAL_INSET * 2) / Math.max(1, options.canvasHeight)),
  );
  return {
    fontSize,
    lineHeight,
    lines,
    maxTextWidth,
    wrap,
    transform: {
      ...transform,
      y: transform.y + (transform.height - height) / 2,
      height,
    },
  };
}
