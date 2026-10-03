import type { Canvas2DContext } from '../canvas-types';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';
import { glassHighlightsAt } from '@beam/engine/zoom/glass-highlight';
import { createGlassCanvas, GlassHighlightGpu } from '../zoom/glass-highlight-gpu';

let gpu: GlassHighlightGpu | null = null;
let scene: ReturnType<typeof createGlassCanvas> | null = null;

/** Captures the completed logical scene once; every lens samples that same scene. No pixel readback. */
export function renderGlassHighlights(
  ctx: Canvas2DContext,
  snapshot: Pick<CompositionSnapshot, 'canvas' | 'zooms'>,
  timeMs: number,
  backdrop?: CanvasImageSource,
) {
  const { width, height } = snapshot.canvas;
  const highlights = glassHighlightsAt(snapshot.zooms, timeMs, width, height);
  if (!highlights.length) return;
  gpu ??= new GlassHighlightGpu();
  scene ??= createGlassCanvas(width, height);
  if (scene.width !== width) scene.width = width;
  if (scene.height !== height) scene.height = height;
  const capture = scene.getContext('2d') as Canvas2DContext | null;
  if (!capture) throw new Error('Glass highlight scene surface unavailable.');
  capture.clearRect(0, 0, width, height);
  // The caller may translate/scale for preview or render into an isolated export surface.
  const inverse = ctx.getTransform().inverse();
  capture.save();
  capture.setTransform(inverse);
  capture.drawImage(backdrop ?? ctx.canvas, 0, 0);
  capture.restore();
  gpu.upload(scene, width, height);
  for (const highlight of highlights) {
    const result = gpu.render(highlight);
    ctx.drawImage(result.canvas, result.x, result.y, result.width, result.height);
  }
}

export function disposeGlassHighlights() {
  gpu?.dispose();
  gpu = null;
  if (scene) scene.width = scene.height = 0;
  scene = null;
}
