import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANNOTATION_SHAPE_STYLE,
  DEFAULT_SHAPE_LAYER_STYLE,
  isShapeLayerStyle,
  normalizeShapeLayerStyle,
} from './shape-layer-style';
import type { ShapeLayerStyle } from './shape-layer-types';

describe('normalizeShapeLayerStyle', () => {
  it('keeps valid arrow styles and clamps finite numeric values', () => {
    expect(
      normalizeShapeLayerStyle({
        family: 'arrow',
        preset: 'arrow',
        rotation: 400,
        borderWidth: 90,
        opacityEnabled: true,
        opacity: -20,
        backdropBlur: 120,
      }),
    ).toMatchObject({
      family: 'arrow',
      preset: 'arrow',
      rotation: 360,
      borderWidth: 40,
      opacityEnabled: true,
      opacity: 0,
      backdropBlur: 100,
    });
  });

  it('falls back for non-finite values and incompatible presets', () => {
    expect(
      normalizeShapeLayerStyle({
        family: 'shape',
        preset: 'arrow',
        opacity: Number.NaN,
        backdropBlur: Number.NEGATIVE_INFINITY,
        shadowBlur: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({
      preset: 'rounded-rectangle',
      opacity: DEFAULT_SHAPE_LAYER_STYLE.opacity,
      backdropBlur: DEFAULT_SHAPE_LAYER_STYLE.backdropBlur,
      shadowBlur: DEFAULT_SHAPE_LAYER_STYLE.shadowBlur,
    });
  });

  it('accepts legacy styles without fill and keeps fillColor as the solid fill', () => {
    const normalized = normalizeShapeLayerStyle(DEFAULT_SHAPE_LAYER_STYLE);

    expect(isShapeLayerStyle(DEFAULT_SHAPE_LAYER_STYLE)).toBe(true);
    expect(normalized).not.toHaveProperty('fill');
    expect(normalized.fillColor).toBe(DEFAULT_SHAPE_LAYER_STYLE.fillColor);
  });

  it('defines the annotation default as an unfilled outlined rectangle', () => {
    expect(DEFAULT_ANNOTATION_SHAPE_STYLE).toMatchObject({
      family: 'shape',
      preset: 'rectangle',
      fillEnabled: false,
      borderColor: '#ff5a1f',
      borderWidth: 8,
      cornerRadius: 0,
    });
    expect(DEFAULT_ANNOTATION_SHAPE_STYLE).not.toHaveProperty('fill');
    expect(isShapeLayerStyle(DEFAULT_ANNOTATION_SHAPE_STYLE)).toBe(true);
    expect(normalizeShapeLayerStyle(DEFAULT_ANNOTATION_SHAPE_STYLE)).toEqual(DEFAULT_ANNOTATION_SHAPE_STYLE);
  });

  it('preserves presets selected from the shared shape catalog', () => {
    const style = { ...DEFAULT_ANNOTATION_SHAPE_STYLE, preset: 'sparkle-quad' as const };

    expect(normalizeShapeLayerStyle(style).preset).toBe('sparkle-quad');
    expect(isShapeLayerStyle(style)).toBe(true);
  });

  it('preserves a valid gradient fill and its fillColor fallback', () => {
    const style = {
      ...DEFAULT_SHAPE_LAYER_STYLE,
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 90,
          stops: [
            { id: 'start', position: 0, color: '#112233', alpha: 1 },
            { id: 'end', position: 1, color: '#aabbcc', alpha: 0.5 },
          ],
        },
      },
      fillColor: '#123456',
    } satisfies ShapeLayerStyle;

    expect(isShapeLayerStyle(style)).toBe(true);
    expect(normalizeShapeLayerStyle(style)).toEqual(style);
    expect(normalizeShapeLayerStyle(style).fillColor).toBe('#123456');
  });

  it('rejects an invalid gradient without losing the fillColor fallback during normalization', () => {
    const style: Partial<ShapeLayerStyle> = {
      ...DEFAULT_SHAPE_LAYER_STYLE,
      fill: {
        kind: 'gradient',
        gradient: {
          type: 'linear',
          angle: 360,
          stops: [
            { id: 'start', position: 0, color: '#112233', alpha: 1 },
            { id: 'end', position: 1, color: '#aabbcc', alpha: 1 },
          ],
        },
      },
      fillColor: '#654321',
    };

    expect(isShapeLayerStyle(style)).toBe(false);
    expect(normalizeShapeLayerStyle(style)).not.toHaveProperty('fill');
    expect(normalizeShapeLayerStyle(style).fillColor).toBe('#654321');
  });
});
