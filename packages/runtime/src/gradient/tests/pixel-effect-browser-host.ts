import type { Canvas2DContext } from '../../canvas-types';
import { createDitheringEffect, createArtisticEffect } from '@beam/engine';
import { drawWithLayerEffects, releaseLayerEffects } from '../layer-effects';
import { paintWithAsyncLayerEffects } from '../async-layer-effects';
import type { LayerEffect } from '@beam/engine/gradient/gradient-types';
export async function renderPixelEffects() {
  const results = [];
  for (const kind of ['dithering', 'ascii', 'grain', 'cyanotype', 'jarvis'] as const) {
    const effect: LayerEffect =
      kind === 'dithering' || kind === 'jarvis' ? createDitheringEffect('test') : createArtisticEffect(kind, 'test');
    if (kind === 'jarvis' && effect.kind === 'dithering') effect.recipe.algorithm = 'jarvis-judice-ninke';
    for (const opacity of [35, 100]) {
      effect.opacity = opacity;
      const canvas = new OffscreenCanvas(64, 64),
        ctx = canvas.getContext('2d')!;
      const original = new OffscreenCanvas(64, 64),
        base = original.getContext('2d')!;
      const draw = (target: Canvas2DContext) => {
        target.fillStyle = 'rgba(188,188,188,0.25)';
        target.fillRect(8, 8, 32, 32);
        target.fillStyle = '#bcbcbc';
        target.fillRect(8, 40, 32, 16);
      };
      draw(base);
      const baseline = base.getImageData(0, 0, 64, 64).data;
      const paint = () => {
        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(52, 0, 12, 64);
        drawWithLayerEffects(ctx, [effect], { x: 8, y: 8, width: 32, height: 48 }, 1, draw);
      };
      if (kind === 'jarvis')
        await paintWithAsyncLayerEffects(ctx, (target) => {
          target.clearRect(0, 0, 64, 64);
          target.fillStyle = '#ff0000';
          target.fillRect(52, 0, 12, 64);
          drawWithLayerEffects(target, [effect], { x: 8, y: 8, width: 32, height: 48 }, 1, draw);
        });
      else paint();
      const pixels = ctx.getImageData(0, 0, 64, 64).data;
      let alphaErrors = 0,
        changed = 0;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 52; x++) {
          const i = (y * 64 + x) * 4;
          if (pixels[i + 3] !== baseline[i + 3]) alphaErrors++;
          if (baseline[i + 3] && [0, 1, 2].some((c) => pixels[i + c] !== baseline[i + c])) changed++;
        }
      const other = Array.from(ctx.getImageData(55, 20, 1, 1).data);
      let stable = true;
      if (kind !== 'jarvis') {
        paint();
        const repeat = ctx.getImageData(0, 0, 64, 64).data;
        stable = pixels.every((v, i) => v === repeat[i]);
      }
      results.push({ kind, opacity, alphaErrors, changed, other, stable });
      releaseLayerEffects(ctx);
    }
  }
  return results;
}
export async function exportPixelEffects() {
  const { createStillDocument } = await import('@beam/engine');
  const { encodeStillImage } = await import('@beam/encoder/still-encoder');
  const source = new OffscreenCanvas(64, 64),
    ctx = source.getContext('2d')!;
  ctx.fillStyle = '#bcbcbc';
  ctx.fillRect(0, 0, 64, 64);
  const results = [];
  for (const kind of ['dithering', 'ascii', 'grain', 'cyanotype', 'jarvis'] as const) {
    const state = createStillDocument('export', 'source.png', 64, 64).state;
    state.canvas.showBackground = false;
    if (state.canvas.watermark) state.canvas.watermark.enabled = false;
    state.format = 'png';
    const effect =
      kind === 'dithering' || kind === 'jarvis' ? createDitheringEffect('x') : createArtisticEffect(kind, 'x');
    if (kind === 'jarvis' && effect.kind === 'dithering') effect.recipe.algorithm = 'jarvis-judice-ninke';
    state.composition!.find((layer) => layer.id === 'image')!.effects = [effect];
    const bytes = await encodeStillImage(state, { image: source, background: null, logo: null, width: 64, height: 64 });
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const output = new OffscreenCanvas(64, 64),
      target = output.getContext('2d')!;
    target.drawImage(bitmap, 0, 0);
    bitmap.close();
    const center = Array.from(target.getImageData(32, 32, 1, 1).data);
    results.push({ kind, bytes: bytes.byteLength, center });
  }
  return results;
}
