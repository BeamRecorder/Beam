import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_CAPTION_EDGE_INSET,
  KEYBOARD_CAPTION_CURSOR_GAP,
  keyboardCaptionTransformAtCursor,
} from '../keyboard-caption-position';

describe('keyboard caption cursor positioning', () => {
  it('places content down and right of a cursor when there is room', () => {
    expect(
      keyboardCaptionTransformAtCursor({
        cursor: { x: 400, y: 200 },
        canvas: { width: 1_000, height: 500 },
        content: { width: 200, height: 100 },
      }),
    ).toEqual({ x: 0.42, y: 0.44, width: 0.2, height: 0.2 });
  });

  it('flips to the upper-left when the cursor is near the lower-right edge', () => {
    const transform = keyboardCaptionTransformAtCursor({
      cursor: { x: 900, y: 400 },
      canvas: { width: 1_000, height: 500 },
      content: { width: 200, height: 100 },
    });

    expect(transform).toEqual({ x: 0.68, y: 0.56, width: 0.2, height: 0.2 });
    expect(transform.x + transform.width).toBeLessThanOrEqual(1 - KEYBOARD_CAPTION_EDGE_INSET / 1_000);
    expect(transform.y + transform.height).toBeLessThanOrEqual(1 - KEYBOARD_CAPTION_EDGE_INSET / 500);
  });

  it('clamps a cursor outside the canvas to the inset on every edge', () => {
    const transform = keyboardCaptionTransformAtCursor({
      cursor: { x: -100, y: -100 },
      canvas: { width: 1_000, height: 500 },
      content: { width: 200, height: 100 },
    });

    expect(transform).toEqual({ x: 0.016, y: 0.032, width: 0.2, height: 0.2 });
  });

  it('clamps oversized content while preserving the edge inset', () => {
    const transform = keyboardCaptionTransformAtCursor({
      cursor: { x: 50, y: 40 },
      canvas: { width: 100, height: 80 },
      content: { width: 200, height: 100 },
    });

    expect(transform).toEqual({
      x: KEYBOARD_CAPTION_EDGE_INSET / 100,
      y: KEYBOARD_CAPTION_EDGE_INSET / 80,
      width: 0.68,
      height: 0.6,
    });
    expect(KEYBOARD_CAPTION_CURSOR_GAP).toBe(20);
  });
});
