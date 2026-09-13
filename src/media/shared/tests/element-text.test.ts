import { describe, expect, it, vi } from 'vitest';
import type { CaptionStyle, ShapeClip } from '../composition-types';
import type { ElementText } from '../element-types';
import {
  createElementText,
  elementTextCaption,
  elementTextLayout,
  isElementText,
  toggleTextDecoration,
} from '../element-text';

const shapeClip = (text?: ElementText): ShapeClip =>
  ({
    id: 'text-layer',
    kind: 'shape',
    name: 'Text layer',
    assetId: '',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
    family: 'text',
    preset: 'text',
    fillColor: '#ffffff',
    borderColor: '#ffffff',
    borderWidth: 0,
    cornerRadius: 16,
    arrowThickness: 36,
    arrowHeadSize: 38,
    rotation: 0,
    opacityEnabled: false,
    opacity: 70,
    backdropBlur: 35,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 32,
    shadowDirection: 'bottom-right',
    ...(text ? { text } : {}),
  }) as ShapeClip;

const withInvalidEdit = (edit: (value: ElementText) => void): unknown => {
  const value = createElementText('Valid');
  edit(value);
  return value;
};

describe('createElementText', () => {
  it('creates a centered, transparent text style with the requested content', () => {
    const text = createElementText('Hello Beam');

    expect(text).toMatchObject({
      content: 'Hello Beam',
      padding: 6,
      verticalAlign: 'center',
    });
    expect(text.style).toMatchObject({
      fontFamily: 'sans-serif',
      fontSize: 48,
      placement: 'center',
      outlineWidth: 0,
      extrusionDepth: 0,
      shadowBlur: 0,
      shape: { opacity: 0, blur: 0, padding: 0 },
    });
  });

  it('defaults to empty content and creates independent nested styles', () => {
    const first = createElementText();
    const second = createElementText();
    first.style.shape.color = '#123456';
    first.style.wordHighlight.gradient.stops[0]!.color = '#654321';

    expect(first.content).toBe('');
    expect(second.style.shape.color).toBe('#000000');
    expect(second.style.wordHighlight.gradient.stops[0]!.color).toBe('#facc15');
  });
});

describe('elementTextCaption', () => {
  it('adapts a persisted shape to shared caption text layout without changing the source layer', () => {
    const source = shapeClip(createElementText('A note'));
    const transform = { x: 0.25, y: 0.15, width: 0.5, height: 0.4 };
    const adapted = elementTextCaption(source, transform);

    expect(adapted).toMatchObject({
      id: source.id,
      kind: 'caption',
      transform,
      caption: { type: 'text', sentences: [], style: { customText: 'A note' } },
    });
    expect(source.kind).toBe('shape');
    expect(source).not.toHaveProperty('caption');
    expect(adapted).not.toBe(source);
  });

  it('provides default text for a shape with no text payload', () => {
    const adapted = elementTextCaption(shapeClip(undefined));

    expect(adapted.caption.style.customText).toBe('');
    expect(adapted.caption.style.fontSize).toBe(48);
  });
});

describe('elementTextLayout', () => {
  it('applies padding relative to the shorter rendered side and centers one wrapped line', () => {
    const clip = shapeClip(createElementText('Hi'));
    const measure = vi.fn((text: string) => text.length * 10);
    const layout = elementTextLayout(clip, { width: 1_000, height: 500 }, measure);

    const insetX = 18 / 1_000;
    const insetY = 18 / 500;
    const boxHeight = 0.6 - 2 * insetY;
    const textHeight = (48 * 1.2 + 8) / 500;
    expect(layout).toEqual({
      x: 0.1 + insetX,
      y: 0.2 + insetY + (boxHeight - textHeight) / 2,
      width: 0.8 - 2 * insetX,
      height: textHeight,
    });
    expect(measure).toHaveBeenCalledWith('Hi', 48, expect.objectContaining({ ...clip.text!.style, customText: 'Hi' }));
  });

  it('wraps text using the supplied measurer and keeps the resulting box inside the padded layer', () => {
    const text = createElementText('one two three four five six');
    text.style.fontSize = 40;
    const clip = shapeClip(text);
    clip.transform = { x: 0.2, y: 0.1, width: 0.1, height: 0.7 };
    const measure = vi.fn((value: string) => value.length * 10);
    const layout = elementTextLayout(clip, { width: 1_000, height: 500 }, measure);
    const inset = 6 / 1_000;
    const box = {
      x: 0.2 + inset,
      y: 0.1 + 2 * inset,
      width: 0.1 - 2 * inset,
      height: 0.7 - 4 * inset,
    };

    expect(measure).toHaveBeenCalled();
    expect(layout.x).toBeCloseTo(box.x);
    expect(layout.width).toBeCloseTo(box.width);
    expect(layout.y).toBeGreaterThanOrEqual(box.y);
    expect(layout.y + layout.height).toBeLessThanOrEqual(box.y + box.height);
    expect(layout.height).toBeGreaterThan((40 * 1.2 + 8) / 500);
  });

  it.each([
    ['top', 0],
    ['center', 0.5],
    ['bottom', 1],
  ] as const)('aligns a non-wrapped line vertically at %s', (verticalAlign, offset) => {
    const text = createElementText('One line');
    text.padding = 0;
    text.verticalAlign = verticalAlign;
    text.style.wrap = false;
    text.style.fontSize = 20;
    text.style.lineHeight = 1.5;
    const clip = shapeClip(text);
    const layout = elementTextLayout(clip, { width: 1_000, height: 500 });
    const lineHeight = (20 * 1.5) / 500;
    const expectedY = clip.transform.y + (clip.transform.height - lineHeight) * offset;

    expect(layout.y).toBeCloseTo(expectedY);
    expect(layout.height).toBeCloseTo(lineHeight);
  });
});

describe('toggleTextDecoration', () => {
  it.each([
    ['none', 'underline', 'underline'],
    ['underline', 'underline', 'none'],
    ['line-through', 'underline', 'underline line-through'],
    ['underline line-through', 'underline', 'line-through'],
    ['none', 'line-through', 'line-through'],
    ['line-through', 'line-through', 'none'],
    ['underline', 'line-through', 'underline line-through'],
    ['underline line-through', 'line-through', 'underline'],
  ] as const)('toggles %s with %s to %s', (current, decoration, expected) =>
    expect(toggleTextDecoration(current as CaptionStyle['textDecoration'], decoration)).toBe(expected),
  );
});

describe('isElementText', () => {
  it('accepts default values and inclusive content, padding, and font-size limits', () => {
    const boundary = createElementText('x'.repeat(10_000));
    boundary.padding = 40;
    boundary.style.fontSize = 256;
    expect(isElementText(createElementText())).toBe(true);
    expect(isElementText(boundary)).toBe(true);

    boundary.content = 'x';
    boundary.padding = 0;
    boundary.style.fontSize = 1;
    expect(isElementText(boundary)).toBe(true);
  });

  it.each([
    ['missing value', null],
    ['non-string content', withInvalidEdit((value) => (value.content = 42 as unknown as string))],
    ['overlong content', withInvalidEdit((value) => (value.content = 'x'.repeat(10_001)))],
    ['non-finite padding', withInvalidEdit((value) => (value.padding = Number.NaN))],
    ['negative padding', withInvalidEdit((value) => (value.padding = -0.01))],
    ['padding above range', withInvalidEdit((value) => (value.padding = 40.01))],
    [
      'unknown vertical alignment',
      withInvalidEdit((value) => (value.verticalAlign = 'middle' as ElementText['verticalAlign'])),
    ],
    ['missing style', { ...createElementText(), style: null }],
    ['non-string font family', withInvalidEdit((value) => (value.style.fontFamily = null as unknown as string))],
    ['non-string text color', withInvalidEdit((value) => (value.style.color = 12 as unknown as string))],
    ['unsupported font weight', withInvalidEdit((value) => (value.style.fontWeight = 700 as 400 | 800))],
    ['unsupported font style', withInvalidEdit((value) => (value.style.fontStyle = 'oblique' as 'normal' | 'italic'))],
    [
      'unsupported decoration',
      withInvalidEdit((value) => (value.style.textDecoration = 'blink' as CaptionStyle['textDecoration'])),
    ],
    [
      'unsupported alignment',
      withInvalidEdit((value) => (value.style.textAlign = 'justify' as CaptionStyle['textAlign'])),
    ],
    ['non-boolean wrapping', withInvalidEdit((value) => (value.style.wrap = 'yes' as unknown as boolean))],
    ['non-finite font size', withInvalidEdit((value) => (value.style.fontSize = Number.POSITIVE_INFINITY))],
    ['font size below range', withInvalidEdit((value) => (value.style.fontSize = 0.99))],
    ['font size above range', withInvalidEdit((value) => (value.style.fontSize = 256.01))],
    ['non-finite line height', withInvalidEdit((value) => (value.style.lineHeight = Number.NaN))],
    ['non-finite letter spacing', withInvalidEdit((value) => (value.style.letterSpacing = Number.NaN))],
    ['non-finite shadow blur', withInvalidEdit((value) => (value.style.shadowBlur = Number.NaN))],
    ['non-finite outline width', withInvalidEdit((value) => (value.style.outlineWidth = Number.NaN))],
    ['non-finite extrusion depth', withInvalidEdit((value) => (value.style.extrusionDepth = Number.NaN))],
    [
      'missing caption shape',
      {
        ...createElementText(),
        style: { ...createElementText().style, shape: null },
      },
    ],
    [
      'missing word highlight settings',
      {
        ...createElementText(),
        style: { ...createElementText().style, wordHighlight: null },
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(isElementText(value as ElementText)).toBe(false);
  });
});
