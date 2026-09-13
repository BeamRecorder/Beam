import type { CaptionClip, CaptionStyle, NormalizedTransform, ShapeClip, TextCaptionData } from './composition-types';
import { createDefaultCaptionStyle } from './composition-defaults';
import { layoutCaptionText, type CaptionTextMeasurer } from './caption-text-layout';
import type { ElementText } from './element-types';

export function createElementText(content = ''): ElementText {
  const style = createDefaultCaptionStyle(48);
  return {
    content,
    padding: 6,
    verticalAlign: 'center',
    style: {
      ...style,
      placement: 'center',
      outlineWidth: 0,
      extrusionDepth: 0,
      shadowBlur: 0,
      shape: { ...style.shape, opacity: 0, blur: 0, padding: 0 },
    },
  };
}

/** Adapts an element to the shared caption layout, editor and renderer. It is never persisted as a timed caption. */
export function elementTextCaption(
  clip: ShapeClip,
  transform = clip.transform,
): CaptionClip & { caption: TextCaptionData } {
  const text = clip.text ?? createElementText();
  return {
    ...clip,
    kind: 'caption',
    transform,
    caption: { type: 'text', sentences: [], style: { ...text.style, customText: text.content } },
  };
}

export function elementTextLayout(
  clip: ShapeClip,
  canvas: { width: number; height: number },
  measureText?: CaptionTextMeasurer,
  transform: NormalizedTransform = clip.transform,
): NormalizedTransform {
  const text = clip.text ?? createElementText();
  const inset = (Math.min(transform.width * canvas.width, transform.height * canvas.height) * text.padding) / 100;
  const box = {
    x: transform.x + inset / canvas.width,
    y: transform.y + inset / canvas.height,
    width: Math.max(1 / canvas.width, transform.width - (2 * inset) / canvas.width),
    height: Math.max(1 / canvas.height, transform.height - (2 * inset) / canvas.height),
  };
  const layout = layoutCaptionText({
    clip: elementTextCaption(clip, box),
    text: text.content,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    measureText,
  });
  const height = layout.wrap ? layout.transform.height : (text.style.fontSize * text.style.lineHeight) / canvas.height;
  return {
    ...box,
    height,
    y:
      text.verticalAlign === 'top'
        ? box.y
        : text.verticalAlign === 'bottom'
          ? box.y + box.height - height
          : box.y + (box.height - height) / 2,
  };
}

export function toggleTextDecoration(
  value: CaptionStyle['textDecoration'],
  decoration: 'underline' | 'line-through',
): CaptionStyle['textDecoration'] {
  const underline = value.includes('underline') !== (decoration === 'underline');
  const strike = value.includes('line-through') !== (decoration === 'line-through');
  return underline ? (strike ? 'underline line-through' : 'underline') : strike ? 'line-through' : 'none';
}

export function isElementText(value: ElementText): boolean {
  if (
    !value ||
    typeof value.content !== 'string' ||
    value.content.length > 10000 ||
    !Number.isFinite(value.padding) ||
    value.padding < 0 ||
    value.padding > 40 ||
    !['top', 'center', 'bottom'].includes(value.verticalAlign)
  )
    return false;
  const s = value.style;
  return Boolean(
    s &&
    typeof s.fontFamily === 'string' &&
    typeof s.color === 'string' &&
    [400, 800].includes(s.fontWeight) &&
    ['normal', 'italic'].includes(s.fontStyle) &&
    ['none', 'underline', 'line-through', 'underline line-through'].includes(s.textDecoration) &&
    ['left', 'center', 'right'].includes(s.textAlign) &&
    typeof s.wrap === 'boolean' &&
    [s.fontSize, s.lineHeight, s.letterSpacing, s.shadowBlur, s.outlineWidth, s.extrusionDepth].every(
      Number.isFinite,
    ) &&
    s.fontSize >= 1 &&
    s.fontSize <= 256 &&
    s.shape &&
    s.wordHighlight,
  );
}
