import { jarvisDither } from './jarvis-dithering';
import { validateDitheringRecipe } from '@beam/engine';
import type { CpuEffectRequest, CpuEffectReply } from './cpu-effect-types';
self.onmessage = ({ data }: MessageEvent<CpuEffectRequest>) => {
  const { source, recipe, pixelRatio } = data;
  const canvas = new OffscreenCanvas(source.width, source.height);
  try {
    validateDitheringRecipe(recipe);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('JJN worker rendering is unavailable.');
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    jarvisDither(pixels.data, pixels.width, pixels.height, recipe, pixelRatio);
    context.putImageData(pixels, 0, 0);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage({ bitmap } satisfies CpuEffectReply, { transfer: [bitmap] });
  } catch (error) {
    self.postMessage({ error: String(error) } satisfies CpuEffectReply);
  } finally {
    source.close();
    canvas.width = canvas.height = 0;
  }
};
