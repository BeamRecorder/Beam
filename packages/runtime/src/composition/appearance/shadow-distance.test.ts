import { describe, expect, it } from 'vitest';
import { createDefaultClipAppearance } from '@beam/engine/shared/composition-defaults';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import { applyClipShadow } from './render-decorated-media';
import { cursorShadowOffset } from '../../cursor/cursor-shadow';
import { cursorRasterBounds } from '../../cursor/cursor-raster-bounds';
import type { CursorGpuOptions } from '../../cursor/cursor-gpu-types';

describe('shadow distance rendering', () => {
  it.each([0, 4, 40, 96])('keeps media displacement independent of blur %s', (shadowBlur) => {
    const context = {} as Canvas2DContext;
    applyClipShadow(
      context,
      {
        ...createDefaultClipAppearance('screen'),
        shadowSize: 'custom',
        shadowBlur,
        shadowDirection: 'bottom-right',
        shadowDistance: 40,
      },
      undefined,
      undefined,
      0.5,
    );
    expect(Math.hypot(context.shadowOffsetX, context.shadowOffsetY)).toBeCloseTo(20);
    expect(context.shadowBlur).toBe(shadowBlur * 0.5);
    expect(context.shadowColor).not.toBe('transparent');
  });
  it('retains old media offsets and supports zero separation', () => {
    const context = {} as Canvas2DContext;
    const appearance = {
      ...createDefaultClipAppearance('screen'),
      shadowSize: 'custom' as const,
      shadowBlur: 40,
      shadowDirection: 'bottom' as const,
    };
    applyClipShadow(context, appearance);
    expect(context.shadowOffsetY).toBe(20);
    applyClipShadow(context, { ...appearance, shadowDistance: 0 });
    expect(context.shadowOffsetY).toBe(0);
    applyClipShadow(context, { ...appearance, shadowDistance: 50, shadowSize: 'none' });
    expect(context.shadowColor).toBe('transparent');
  });
  it('keeps legacy cursor rounding while supporting independent and centered shadows', () => {
    expect(cursorShadowOffset(13, 'bottom')).toEqual({ x: 0, y: 5 });
    expect(cursorShadowOffset(13, 'bottom', 25)).toEqual({ x: 0, y: 25 });
    expect(cursorShadowOffset(1, 'bottom', 25)).toEqual({ x: 0, y: 25 });
    expect(cursorShadowOffset(13, 'all', 25)).toEqual({ x: 0, y: 0 });
  });
  it('reserves GPU raster space for distant shadows', () => {
    const options: CursorGpuOptions = {
      image: {} as ImageBitmap,
      geometry: { width: 40, height: 40, hotspot: { x: 0, y: 0 } },
      samples: [{ x: 0, y: 0, weight: 1 }],
      shadow: { enabled: true, blur: 4, color: '#000000', direction: 'bottom' },
      resolution: 1,
    };
    const old = cursorRasterBounds(options, 4096);
    const distant = cursorRasterBounds({ ...options, shadow: { ...options.shadow, distance: 40 } }, 4096);
    expect(distant.width).toBe(old.width + 80);
    expect(distant.height).toBe(old.height + 80);
    expect(() => cursorRasterBounds({ ...options, shadow: { ...options.shadow, distance: NaN } }, 4096)).toThrow();
  });
});
