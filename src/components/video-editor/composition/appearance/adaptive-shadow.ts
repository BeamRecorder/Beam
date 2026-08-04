import type { MediaRect } from './appearance-types';

const SAMPLE_SIZE = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleContext: CanvasRenderingContext2D | null = null;

const fallback = (color: string) => color || '#000000';

const contextForSampling = () => {
  if (sampleContext) return sampleContext;
  try {
    if (typeof document === 'undefined') return null;
    sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = SAMPLE_SIZE;
    sampleCanvas.height = SAMPLE_SIZE;
    sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
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
    return shadowColorFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, fallbackColor);
  } catch {
    return fallback(fallbackColor);
  }
}
