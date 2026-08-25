import type { PhoneFrameFill } from '~/media/shared/color-fill-types';
import type { Canvas2DContext } from '~/types/canvas';
import { renderBackground } from '../background/render-background';
import type { MediaRect } from './appearance-types';

const SAMPLE_WIDTH = 3;
const SAMPLE_HEIGHT = 3;
const FALLBACK_COLORS = ['#111827', '#312e81', '#0f172a'] as const;
let sampleCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let sampleContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
const sampleCache = new WeakMap<object, { key: string; colors: string[]; age: number }>();
const SAMPLE_INTERVAL = 6;

const samplingContext = () => {
  if (sampleContext) return sampleContext;
  try {
    if (typeof OffscreenCanvas !== 'undefined') sampleCanvas = new OffscreenCanvas(SAMPLE_WIDTH, SAMPLE_HEIGHT);
    else if (typeof document !== 'undefined') {
      sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = SAMPLE_WIDTH;
      sampleCanvas.height = SAMPLE_HEIGHT;
    } else return null;
    sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  } catch {
    sampleCanvas = null;
    sampleContext = null;
  }
  return sampleContext;
};

const channelToHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

export const adaptivePhoneFillColors = (pixels: Uint8ClampedArray) => {
  if (pixels.length < SAMPLE_WIDTH * SAMPLE_HEIGHT * 4) return [...FALLBACK_COLORS];
  return Array.from({ length: SAMPLE_HEIGHT }, (_, row) => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;
    for (let column = 0; column < SAMPLE_WIDTH; column += 1) {
      const index = (row * SAMPLE_WIDTH + column) * 4;
      const alpha = pixels[index + 3] / 255;
      red += pixels[index] * alpha;
      green += pixels[index + 1] * alpha;
      blue += pixels[index + 2] * alpha;
      weight += alpha;
    }
    if (weight < 0.05) return FALLBACK_COLORS[row];
    const polish = (channel: number) => Math.min(255, Math.max(0, (channel / weight) * 0.72 + 18));
    return `#${channelToHex(polish(red))}${channelToHex(polish(green))}${channelToHex(polish(blue))}`;
  });
};

const sampleColors = (source: CanvasImageSource, sourceRect?: MediaRect) => {
  const key = sourceRect ? `${sourceRect.x}:${sourceRect.y}:${sourceRect.width}:${sourceRect.height}` : 'full';
  const cached = sampleCache.get(source as object);
  if (cached?.key === key && cached.age < SAMPLE_INTERVAL) {
    cached.age += 1;
    return cached.colors;
  }
  const ctx = samplingContext();
  if (!ctx || !sampleCanvas) return [...FALLBACK_COLORS];
  try {
    ctx.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    if (sourceRect)
      ctx.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        SAMPLE_WIDTH,
        SAMPLE_HEIGHT,
      );
    else ctx.drawImage(source, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    const colors = adaptivePhoneFillColors(ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
    sampleCache.set(source as object, { key, colors, age: 0 });
    return colors;
  } catch {
    const colors = [...FALLBACK_COLORS];
    sampleCache.set(source as object, { key, colors, age: 0 });
    return colors;
  }
};

const sourceDimensions = (source: CanvasImageSource, sourceRect?: MediaRect) => {
  if (sourceRect) return sourceRect;
  const value = source as unknown as Record<string, unknown>;
  const dimension = (...keys: string[]) => {
    for (const key of keys) {
      const next = value[key];
      if (typeof next === 'number' && Number.isFinite(next) && next > 0) return next;
    }
    return 1;
  };
  return {
    x: 0,
    y: 0,
    width: dimension('videoWidth', 'naturalWidth', 'displayWidth', 'width'),
    height: dimension('videoHeight', 'naturalHeight', 'displayHeight', 'height'),
  };
};

const drawContinuityFill = (
  ctx: Canvas2DContext,
  fill: Extract<PhoneFrameFill, { kind: 'continuity' }>,
  rect: MediaRect,
  source: CanvasImageSource,
  sourceRect?: MediaRect,
  mirrored = false,
  mirroredY = false,
) => {
  const crop = sourceDimensions(source, sourceRect);
  const overscan = fill.blur * 2;
  const target = {
    x: rect.x - overscan,
    y: rect.y - overscan,
    width: rect.width + overscan * 2,
    height: rect.height + overscan * 2,
  };
  const scale = Math.max(target.width / crop.width, target.height / crop.height);
  const width = crop.width * scale;
  const height = crop.height * scale;
  ctx.save();
  ctx.filter = `blur(${fill.blur}px) brightness(${fill.brightness}%) saturate(110%)`;
  if (mirrored || mirroredY) {
    ctx.translate(mirrored ? rect.x * 2 + rect.width : 0, mirroredY ? rect.y * 2 + rect.height : 0);
    ctx.scale(mirrored ? -1 : 1, mirroredY ? -1 : 1);
  }
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    target.x + (target.width - width) / 2,
    target.y + (target.height - height) / 2,
    width,
    height,
  );
  ctx.restore();
};

export function drawPhoneFrameFill(
  ctx: Canvas2DContext,
  fill: PhoneFrameFill,
  rect: MediaRect,
  radius: number,
  source: CanvasImageSource,
  sourceRect?: MediaRect,
  mirrored?: boolean,
  mirroredY?: boolean,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  if (fill.kind === 'continuity') drawContinuityFill(ctx, fill, rect, source, sourceRect, mirrored, mirroredY);
  else if (fill.kind === 'adaptive') {
    const colors = sampleColors(source, sourceRect);
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  } else renderBackground(ctx, { value: fill, rect, blurPixels: 0 });
  ctx.restore();
}
