import { describe, expect, it } from 'vitest';
import type { ShapeClip } from '../composition-types';
import { DEFAULT_SHAPE_LAYER_STYLE } from '../shape-layer-style';
import { createElementText, elementTextCaption, elementTextLayout } from '../element-text';
import { elementTextRegion } from '../element-text-region';
import { vectorForShape } from '../shape-vector-presets';
import { reframeVector } from '../shape-vector-edit';

const canvas = { width: 1000, height: 500 };
const bubble = (): ShapeClip => ({
  ...DEFAULT_SHAPE_LAYER_STYLE,
  id: 'bubble',
  kind: 'shape',
  preset: 'speech-bubble',
  name: 'Bubble',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  order: 0,
  enabled: true,
  transform: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
  text: createElementText('TEXT'),
});

describe('speech bubble text body', () => {
  it('uses the SVG body from x=3..97 and y=8..77, excluding the tail down to y=96', () => {
    const region = elementTextRegion(bubble());
    expect(region.x).toBeCloseTo(0.124);
    expect(region.y).toBeCloseTo(0.248);
    expect(region.width).toBeCloseTo(0.752);
    expect(region.height).toBeCloseTo(0.414);
  });

  for (const wrap of [false, true])
    for (const padding of [0, 12])
      it.each(['top', 'center', 'bottom'] as const)(
        `aligns %s inside the body (wrap=${wrap}, padding=${padding})`,
        (verticalAlign) => {
          const clip = bubble(),
            text = clip.text!;
          Object.assign(text, { padding, verticalAlign });
          Object.assign(text.style, { wrap, fontSize: 24, lineHeight: 1.5 });
          const layout = elementTextLayout(clip, canvas, (value) => value.length * 10);
          const bodyTop = 124,
            bodyBottom = 331,
            bodyHeight = 207;
          const inset = (bodyHeight * padding) / 100;
          const height = wrap ? 44 : 36;
          expect(layout.height * canvas.height).toBeCloseTo(height);
          expect(layout.y * canvas.height).toBeCloseTo(
            verticalAlign === 'top'
              ? bodyTop + inset
              : verticalAlign === 'bottom'
                ? bodyBottom - inset - height
                : (bodyTop + bodyBottom - height) / 2,
          );
          expect(layout.y + layout.height).toBeLessThanOrEqual(bodyBottom / canvas.height + 1e-12);
        },
      );

  it('wraps multiline text inside the same narrower padded body', () => {
    const clip = bubble();
    clip.text!.content = 'one two three four five six seven eight';
    clip.transform.width = 0.2;
    clip.text!.style.fontSize = 18;
    const region = elementTextRegion(clip),
      layout = elementTextLayout(clip, canvas, (text) => text.length * 10);
    expect(layout.width).toBeLessThan(region.width);
    expect(layout.height).toBeGreaterThan((2 * 18) / canvas.height);
    expect(layout.y).toBeGreaterThan(region.y);
    expect(layout.y + layout.height).toBeLessThan(region.y + region.height);
  });

  it('keeps the body fixed when extending or moving the vector tail beyond its original bounds', () => {
    const clip = bubble(),
      original = elementTextRegion(clip);
    const vector = vectorForShape(clip, canvas);
    const tip = vector.contours[0]!.nodes.find((node) => node.id === 'node-6')!;
    tip.x = -0.4;
    tip.y = 1.8;
    const reframed = reframeVector(vector, clip.transform, canvas);
    const edited = { ...clip, ...reframed };
    const region = elementTextRegion(edited);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(region[key]).toBeCloseTo(original[key], 12);
    const before = elementTextLayout(clip, canvas),
      after = elementTextLayout(edited, canvas);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(after[key]).toBeCloseTo(before[key], 12);
  });

  it('follows actual vector body edits and an explicitly resized drawing transform', () => {
    const clip = bubble();
    clip.vector = vectorForShape(clip, canvas);
    clip.vector.contours[0]!.nodes.find((node) => node.id === 'node-4')!.y = 0.85;
    const transform = { x: 0, y: 0, width: 1, height: 1 };
    const region = elementTextRegion(clip, transform);
    expect(region.y).toBe(0.08);
    expect(region.height).toBeCloseTo(0.77);
    expect(clip.transform.x).toBe(0.1);
  });

  it('uses ordinary text frames for other shapes and completely replaced vector paths', () => {
    const clip = bubble();
    for (const preset of ['text', 'rectangle', 'arrow'] as const)
      expect(elementTextRegion({ ...clip, preset })).toBe(clip.transform);
    clip.vector = vectorForShape(clip, canvas);
    clip.vector.contours.forEach((contour) =>
      contour.nodes.forEach((node) => {
        node.id = `custom-${node.id}`;
      }),
    );
    expect(elementTextRegion(clip)).toBe(clip.transform);
  });

  it('leaves rotation to the enclosing layer instead of rotating the caption twice', () => {
    const clip = { ...bubble(), rotation: 35 };
    expect(elementTextCaption(clip).rotation).toBe(0);
    expect(clip.rotation).toBe(35);
  });
});
