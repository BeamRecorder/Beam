import { describe, expect, it, vi } from 'vitest';
import { createCursorMotionPlayer } from '@beam/engine/cursor/cursor-motion';
import { cursorStateAt } from '@beam/engine/cursor/cursorPlayback';
import { cursorRippleAt } from '@beam/engine/cursor/cursor-ripple';
import { drawCursorLayer } from '../cursor-render';
import { renderCompositionFrame } from '../render';
import { context, snapshot } from './render.test-support';

describe('cursor raster density', () => {
  it.each(['missing pack', 'unsupported button', 'no ripple style'] as const)(
    'keeps the source visible with %s',
    (mode) => {
      const value = snapshot();
      value.cursor.available = true;
      value.cursor.events = [
        { event: 'move', sessionNs: 0, pixelX: 50, pixelY: 25, normalizedX: 0.5, normalizedY: 0.5, visible: true },
        { event: 'button', sessionNs: 50_000_000, button: mode === 'unsupported button' ? 4 : 1, pressed: true },
      ];
      value.cursorSettings.motion.motionBlur = 0;
      if (mode === 'missing pack') value.cursorPack = null;
      else value.cursorSettings.clickEffects.left.rippleEnabled = true;
      if (mode === 'no ripple style') value.cursorSettings.clickEffects.left.rippleStyle = 'none';
      const image = { width: 32, height: 32 } as ImageBitmap;
      const source = {} as CanvasImageSource;
      const ctx = context();
      renderCompositionFrame(ctx, { source, width: 100, height: 50 }, value, 0.1, null, new Map([['default', image]]));

      const draws = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls;
      expect(draws.some(([drawn]) => drawn === source)).toBe(true);
      expect(draws.some(([drawn]) => drawn === image)).toBe(mode !== 'missing pack');
      expect(ctx.arc).not.toHaveBeenCalled();
    },
  );

  it.each([1, 2, 0.5])('preserves cursor, shadow and ripple proportions at density %s', (density) => {
    const value = snapshot();
    const screen = value.composition.clips[0]!;
    if (screen.kind !== 'screen') throw new Error('Missing screen fixture');
    value.cursor.available = true;
    value.cursor.events = [
      { event: 'move', sessionNs: 0, pixelX: 50, pixelY: 25, normalizedX: 0.5, normalizedY: 0.5, visible: true },
      { event: 'button', sessionNs: 50_000_000, button: 1, pressed: true, normalizedX: 0.5, normalizedY: 0.5 },
    ];
    value.cursorSettings.motion.motionBlur = 0;
    value.cursorSettings.shadow = { enabled: true, blur: 4, color: '#000', direction: 'bottom' };
    value.cursorSettings.clickEffects.left = {
      ...value.cursorSettings.clickEffects.left,
      springEnabled: false,
      rippleEnabled: true,
      rippleStyle: 'single',
      rippleSize: 40,
    };
    const image = { width: 32, height: 32 } as ImageBitmap;
    const ctx = context();
    const motion = createCursorMotionPlayer(value.cursor.events, value.cursorSettings.motion, 100, 50);
    drawCursorLayer(
      ctx,
      value,
      0.1,
      screen,
      100,
      50,
      100 * density,
      50 * density,
      new Map([['default', image]]),
      motion,
      motion.sample(0.1, cursorStateAt(value.cursor.events, 0.1)),
      density,
    );

    const [, , , width, height] = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(width).toBe(24 * density);
    expect(height).toBe(24 * density);
    expect(ctx.shadowBlur).toBe(4 * density);
    expect(ctx.lineWidth).toBe(2.5 * density);
    const ring = cursorRippleAt(0.05, 40, 'single')!.rings[0]!;
    expect(ctx.arc).toHaveBeenCalledWith(50 * density, 25 * density, ring.radius * density, 0, Math.PI * 2);
    expect(value.cursorSettings.size).toBe(24);
    expect(value.cursorSettings.shadow.blur).toBe(4);
    expect(value.cursorSettings.clickEffects.left.rippleSize).toBe(40);
  });
});
