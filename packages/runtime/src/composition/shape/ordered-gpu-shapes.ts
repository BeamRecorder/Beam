import { GpuSceneRenderer } from '@beam/runtime/gpu/gpu-scene-renderer';
import type { GpuSceneCommand } from '@beam/runtime/gpu/gpu-scene-types';
import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { NormalizedTransform, ShapeClip, BlurClip } from '@beam/engine/shared/composition-types';
import { gpuShapePlan } from '@beam/runtime/composition/shape/gpu-shape-plan';
import type { GpuShapePaintContext } from '@beam/runtime/composition/shape/gpu-shape-plan-types';
import { OrderedGpuEffects } from '@beam/runtime/composition/effects/ordered-gpu-effects';
import { disposeBlurEffect } from '@beam/runtime/composition/effects/blur-effect';

const MIN_GPU_PRIMITIVES = 4096;
const MAX_GPU_PRIMITIVES = 65536;
const MAX_PENDING_SHAPES = 16384;
const batches = new WeakMap<Canvas2DContext, OrderedGpuShapes>();

class OrderedGpuShapes {
  private gpu: GpuSceneRenderer | null = null;
  private commands: GpuSceneCommand[] = [];
  private native: (() => void)[] = [];
  private readonly ctx: Canvas2DContext;
  private paint: GpuShapePaintContext | null = null;
  private readonly effects: OrderedGpuEffects;
  constructor(ctx: Canvas2DContext) {
    this.ctx = ctx;
    this.effects = new OrderedGpuEffects(ctx);
  }
  tryShape(
    clip: ShapeClip,
    viewport: { x: number; y: number; width: number; height: number },
    draw: () => void,
    transform?: NormalizedTransform,
  ): boolean {
    this.effects.flush();
    // A composition pass owns a stable CTM. Native layer painters save/restore
    // their local transforms; the GPU bridge also restores the inherited state.
    const previous = this.paint?.viewport;
    if (
      !previous ||
      previous.x !== viewport.x ||
      previous.y !== viewport.y ||
      previous.width !== viewport.width ||
      previous.height !== viewport.height
    ) {
      const matrix = this.paint?.matrix ?? this.ctx.getTransform();
      this.paint = {
        matrix,
        viewport,
        key: JSON.stringify([viewport, matrix.a, matrix.d, matrix.e, matrix.f]),
      };
    }
    const commands = gpuShapePlan(this.ctx, clip, viewport, transform, this.paint!);
    if (!commands) return false;
    this.commands.push(...commands);
    this.native.push(draw);
    if (this.commands.length >= MAX_GPU_PRIMITIVES || this.native.length >= MAX_PENDING_SHAPES) this.flush();
    return true;
  }
  tryBlur(
    clip: BlurClip,
    viewport: { x: number; y: number; width: number; height: number },
    transform = clip.transform,
  ): boolean {
    this.flushShapes();
    return this.effects.tryEffect(
      clip,
      {
        x: viewport.x + transform.x * viewport.width,
        y: viewport.y + transform.y * viewport.height,
        width: transform.width * viewport.width,
        height: transform.height * viewport.height,
      },
      viewport,
    );
  }
  flush(): void {
    this.flushShapes();
    this.effects.flush();
  }
  private flushShapes(): void {
    const commands = this.commands,
      native = this.native;
    this.commands = [];
    this.native = [];
    if (commands.length < MIN_GPU_PRIMITIVES) {
      for (const draw of native) draw();
      return;
    }
    this.gpu ??= new GpuSceneRenderer();
    const source = this.gpu.render(commands, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.save();
    try {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(source, 0, 0);
    } finally {
      this.ctx.restore();
    }
  }
  clear(): void {
    this.effects.clear();
    this.paint = null;
    this.commands = [];
    this.native = [];
  }
  dispose(): void {
    this.clear();
    this.gpu?.dispose();
    this.gpu = null;
    disposeBlurEffect(this.ctx);
  }
}

/** Native complex layers are ordering barriers, not an error recovery path. */
export function withOrderedGpuShapes(ctx: Canvas2DContext, draw: (batch: OrderedGpuShapes) => void): void {
  let batch = batches.get(ctx);
  if (!batch) {
    batch = new OrderedGpuShapes(ctx);
    batches.set(ctx, batch);
  }
  try {
    draw(batch);
    batch.flush();
  } finally {
    batch.clear();
  }
}
export function disposeGpuShapes(ctx: Canvas2DContext | undefined | null): void {
  if (!ctx) return;
  batches.get(ctx)?.dispose();
  batches.delete(ctx);
}

/** Preview/export own all their primary, transition and perspective scratch contexts. */
export function createGpuShapeScope() {
  const contexts = new Set<Canvas2DContext>();
  return {
    render(ctx: Canvas2DContext, draw: (batch: OrderedGpuShapes) => void): void {
      contexts.add(ctx);
      withOrderedGpuShapes(ctx, draw);
    },
    dispose(): void {
      for (const ctx of contexts) disposeGpuShapes(ctx);
      contexts.clear();
    },
  };
}
