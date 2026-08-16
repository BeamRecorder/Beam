import { describe, expect, it } from 'vitest';
import type { CaptionStyle } from '../composition-types';
import { applyCanvasCaptionFont } from '../caption-font';

const style = (letterSpacing: number): CaptionStyle =>
  ({
    fontFamily: 'Aptos Display',
    fontWeight: 400,
    fontStyle: 'italic',
    fontSize: 40,
    letterSpacing,
  }) as CaptionStyle;

const context = () =>
  ({
    font: '',
    letterSpacing: '',
  }) as unknown as CanvasRenderingContext2D;

describe('caption font canvas styles', () => {
  it('scales positive letter spacing with the rendered font size', () => {
    const ctx = context();

    applyCanvasCaptionFont(ctx, style(2.5), 80);

    expect(ctx.font).toBe('italic 400 80px "Aptos Display"');
    expect(ctx.letterSpacing).toBe('5px');
  });

  it('preserves negative letter spacing when scaling down', () => {
    const ctx = context();

    applyCanvasCaptionFont(ctx, style(-5), 20);

    expect(ctx.font).toBe('italic 400 20px "Aptos Display"');
    expect(ctx.letterSpacing).toBe('-2.5px');
  });
});
