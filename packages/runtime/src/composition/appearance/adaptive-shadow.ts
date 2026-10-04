import type { AdaptiveShadowRequest, MediaRect } from '@beam/runtime/composition/appearance/appearance-types';
import {
  createImmutableMediaCache,
  isImmutableMedia,
  IMMUTABLE_MEDIA_CACHE_VARIANTS,
} from '@beam/runtime/composition/appearance/immutable-media-cache';

const SAMPLE_SIZE = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
let sampleCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let sampleContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
const sampledColors = createImmutableMediaCache<string>();
const BATCH_SAMPLES = 128;
let batchCanvas: OffscreenCanvas | null = null;
let batchContext: OffscreenCanvasRenderingContext2D | null = null;
const sampleKey = (rect: MediaRect | undefined, color: string) => JSON.stringify([rect ?? null, color]);

const fallback = (color: string) => color || '#000000';

const contextForSampling = () => {
  if (sampleContext) return sampleContext;
  try {
    if (typeof OffscreenCanvas !== 'undefined') sampleCanvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    else if (typeof document !== 'undefined') {
      sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = SAMPLE_SIZE;
      sampleCanvas.height = SAMPLE_SIZE;
    } else return null;
    sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
  } catch {
    sampleCanvas = null;
    sampleContext = null;
  }
  return sampleContext;
};

const rgbToHsl = (red: number, green: number, blue: number) => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 210, saturation: 0, lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue /= 6;
  return { hue: hue * 360, saturation, lightness };
};

export function shadowColorFromPixels(pixels: Uint8ClampedArray, fallbackColor = '#000000') {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weightTotal = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.08) continue;
    const pixelRed = pixels[index];
    const pixelGreen = pixels[index + 1];
    const pixelBlue = pixels[index + 2];
    const chroma = (Math.max(pixelRed, pixelGreen, pixelBlue) - Math.min(pixelRed, pixelGreen, pixelBlue)) / 255;
    const weight = alpha * (0.35 + chroma);
    red += pixelRed * weight;
    green += pixelGreen * weight;
    blue += pixelBlue * weight;
    weightTotal += weight;
  }
  if (!weightTotal) return fallback(fallbackColor);
  const color = rgbToHsl(red / weightTotal, green / weightTotal, blue / weightTotal);
  const saturation = clamp(Math.max(0.28, color.saturation * 1.7), 0.28, 0.82);
  const lightness = clamp(color.lightness * 0.48, 0.12, 0.36);
  return `hsla(${Math.round(color.hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%, 0.52)`;
}

export function adaptiveShadowColor(source: CanvasImageSource, sourceRect?: MediaRect, fallbackColor = '#000000') {
  const key = sampleKey(sourceRect, fallbackColor);
  const cached = sampledColors.get(source, key);
  if (cached !== undefined) return cached;
  const ctx = contextForSampling();
  if (!ctx || !sampleCanvas) return fallback(fallbackColor);
  try {
    ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    if (sourceRect) {
      ctx.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        SAMPLE_SIZE,
        SAMPLE_SIZE,
      );
    } else {
      ctx.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    }
    const color = shadowColorFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, fallbackColor);
    sampledColors.set(source, key, color);
    return color;
  } catch {
    return fallback(fallbackColor);
  }
}

/** Sample independent immutable frames before painting, with one GPU readback per batch. */
export function primeAdaptiveShadowColors(requests: readonly AdaptiveShadowRequest[]): void {
  const pending: AdaptiveShadowRequest[] = [];
  const seen = new Map<CanvasImageSource, Set<string>>();
  for (const request of requests) {
    if (!isImmutableMedia(request.source)) continue;
    const key = sampleKey(request.sourceRect, request.fallbackColor ?? '#000000');
    if (sampledColors.get(request.source, key) !== undefined || seen.get(request.source)?.has(key)) continue;
    let keys = seen.get(request.source);
    if (!keys) seen.set(request.source, (keys = new Set()));
    if (keys.size === IMMUTABLE_MEDIA_CACHE_VARIANTS) continue;
    keys.add(key);
    pending.push(request);
  }
  if (!pending.length || typeof OffscreenCanvas === 'undefined') return;
  try {
    batchCanvas ??= new OffscreenCanvas(SAMPLE_SIZE * BATCH_SAMPLES, SAMPLE_SIZE);
    batchContext ??= batchCanvas.getContext('2d', { willReadFrequently: false });
    if (!batchContext) return;
    for (let offset = 0; offset < pending.length; offset += BATCH_SAMPLES) {
      const batch = pending.slice(offset, offset + BATCH_SAMPLES);
      const width = batch.length * SAMPLE_SIZE;
      batchContext.clearRect(0, 0, batchCanvas.width, batchCanvas.height);
      for (let i = 0; i < batch.length; i++) {
        const { source, sourceRect: r } = batch[i]!;
        if (r)
          batchContext.drawImage(source, r.x, r.y, r.width, r.height, i * SAMPLE_SIZE, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        else batchContext.drawImage(source, i * SAMPLE_SIZE, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      }
      const pixels = batchContext.getImageData(0, 0, width, SAMPLE_SIZE).data;
      for (let i = 0; i < batch.length; i++) {
        const sample = new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4);
        for (let row = 0; row < SAMPLE_SIZE; row++) {
          const start = (row * width + i * SAMPLE_SIZE) * 4;
          sample.set(pixels.subarray(start, start + SAMPLE_SIZE * 4), row * SAMPLE_SIZE * 4);
        }
        const request = batch[i]!,
          color = request.fallbackColor ?? '#000000';
        sampledColors.set(request.source, sampleKey(request.sourceRect, color), shadowColorFromPixels(sample, color));
      }
    }
  } catch {
    // Optional sampling failures already use the selected shadow color. The
    // batching optimization must not turn them into a preview/export failure.
    if (batchCanvas) batchCanvas.width = batchCanvas.height = 0;
    batchCanvas = batchContext = null;
  }
}
