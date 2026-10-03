import type { BlurClip } from '@beam/engine/shared/composition-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { EffectRect } from '@beam/runtime/composition/effects/effect-types';
import { effectDeviceRect, planGpuEffect } from '@beam/runtime/composition/effects/gpu-effect-plan';
import { applyBlurEffect, withGpuBlurGroup } from '@beam/runtime/composition/effects/blur-effect';

/** Native paints/transitions are barriers. Overlapping effects sample each preceding GPU result. */
export class OrderedGpuEffects {
  private pending: { clip: BlurClip; rect: EffectRect; region: EffectRect }[] = [];
  private readonly ctx: Canvas2DContext;
  constructor(ctx: Canvas2DContext) {
    this.ctx = ctx;
  }
  tryEffect(clip: BlurClip, rect: EffectRect, viewport: EffectRect): boolean {
    const ctx = this.ctx;
    if (
      ctx.globalAlpha !== 1 ||
      ctx.globalCompositeOperation !== 'source-over' ||
      ctx.filter !== 'none' ||
      ctx.shadowBlur !== 0 ||
      ctx.shadowOffsetX !== 0 ||
      ctx.shadowOffsetY !== 0 ||
      clip.transitions?.entry ||
      clip.transitions?.exit ||
      clip.mode === 'highlight'
    )
      return false;
    if (ctx.shadowColor && ctx.shadowColor !== 'rgba(0, 0, 0, 0)' && ctx.shadowColor !== 'transparent') return false;
    const matrix = ctx.getTransform();
    if (matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0) return false;
    const plan = planGpuEffect(ctx, clip, rect, {});
    if (!plan) return false;
    const r = plan.region,
      scope = effectDeviceRect(ctx, viewport);
    const inset = Math.max(32, (Math.min(scope.width, scope.height) * (1 - Math.SQRT1_2)) / 2);
    // Known composition scope: leave inherited canvas and rounded-window clipping edges untouched.
    if (
      r.x < inset ||
      r.y < inset ||
      r.x + r.width > ctx.canvas.width - inset ||
      r.y + r.height > ctx.canvas.height - inset
    )
      return false;
    if (
      r.x < scope.x + inset ||
      r.y < scope.y + inset ||
      r.x + r.width > scope.x + scope.width - inset ||
      r.y + r.height > scope.y + scope.height - inset
    )
      return false;
    this.pending.push({ clip, rect, region: r });
    if (this.pending.length === 256) this.flush();
    return true;
  }
  flush(): void {
    const pending = this.pending;
    this.pending = [];
    if (!pending.length) return;
    const draw = () => {
      for (const { clip, rect } of pending) applyBlurEffect(this.ctx, clip, rect);
    };
    if (pending.length === 1) draw();
    else {
      const x = Math.min(...pending.map((item) => item.region.x)),
        y = Math.min(...pending.map((item) => item.region.y));
      const right = Math.max(...pending.map((item) => item.region.x + item.region.width)),
        bottom = Math.max(...pending.map((item) => item.region.y + item.region.height));
      withGpuBlurGroup(this.ctx, draw, { x, y, width: right - x, height: bottom - y });
    }
  }
  clear(): void {
    this.pending = [];
  }
}
