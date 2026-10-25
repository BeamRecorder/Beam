import type { GpuTransitionPreset } from '@beam/engine/shared/transition-types';
import { drawTransitionEffect } from './transition-effects';
import { createRenderDocument } from '@beam/engine/document/render-document';
import { cursorComposition, screenClip } from '@beam/engine/capture/screen-cursor.test-support';
import { renderCompositionFrame } from '@beam/runtime/rendering/render';
import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';

const presets: GpuTransitionPreset[] = [
  { kind: 'fade-black' },
  { kind: 'fade-white' },
  { kind: 'dip-color', color: '#24a8e0' },
  { kind: 'color-fade', color: '#24a8e0' },
  { kind: 'color-flash', color: '#24a8e0' },
  { kind: 'cross-zoom' },
  { kind: 'zoom-bounce' },
  { kind: 'split' },
  { kind: 'push-panels' },
  { kind: 'sliding-panels' },
  { kind: 'circle-reveal' },
  { kind: 'diamond-wipe' },
  { kind: 'linear-wipe' },
  { kind: 'gradient-wipe' },
  { kind: 'whip-pan' },
  { kind: 'push' },
  { kind: 'camera-shake' },
  { kind: 'rgb-split' },
  { kind: 'digital-glitch' },
  { kind: 'pixel-blocks' },
];
const width = 96;
const height = 64;
const destination = { x: 12, y: 10, width, height };

/** The completed compositor must isolate a recording and leave its already-painted backdrop intact. */
export function renderTransitionComposition() {
  const source = new OffscreenCanvas(width, height),
    sourceContext = source.getContext('2d')!;
  sourceContext.fillStyle = '#45ba81';
  sourceContext.fillRect(0, 0, width, height);
  const canvas = new OffscreenCanvas(width, height),
    context = canvas.getContext('2d')!;
  const clip = screenClip('effect', {
    transitions: {
      entry: { preset: { kind: 'circle-reveal' }, durationMs: 500, easingPower: 1 },
      exit: null,
    },
  });
  clip.appearance.shadowSize = 'none';
  clip.appearance.cornerRadius = 'none';
  const snapshot = createRenderDocument(cursorComposition([clip]), width, height);
  const render = (value: CompositionSnapshot, time: number) => {
    context.clearRect(0, 0, width, height);
    renderCompositionFrame(context, { source, width, height }, value, time);
    return Array.from(context.getImageData(0, 0, width, height).data);
  };
  const middle = render(snapshot, 0.25),
    first = render(snapshot, 0),
    final = render(snapshot, 0.5),
    reverse = render(snapshot, 0.25);
  const canvasSnapshot = {
    ...snapshot,
    composition: cursorComposition([{ ...clip, transitions: { entry: null, exit: null } }]),
    canvas: { ...snapshot.canvas, transitions: clip.transitions },
  };
  const wholeCanvas = render(canvasSnapshot, 0.25);
  const sample = (data: number[], x: number, y: number) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 4);
  return {
    center: sample(middle, 48, 32),
    corner: sample(middle, 1, 1),
    start: sample(first, 48, 32),
    final: sample(final, 1, 1),
    reverseMatches: middle.every((v, i) => v === reverse[i]),
    canvasMatches: middle.every((v, i) => v === wholeCanvas[i]),
  };
}

function fixture() {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const shade = (Math.floor(x / 11) + Math.floor(y / 9)) % 3 === 0 ? 238 : x < 35 ? 45 : y > 28 ? 170 : 91;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = shade;
      image.data[index + 3] = x >= 76 && y < 16 ? 0 : x >= 64 && y >= 48 ? 128 : 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function pixels(context: OffscreenCanvasRenderingContext2D) {
  return context.getImageData(destination.x, destination.y, width, height).data;
}

function digest(data: Uint8ClampedArray) {
  let hash = 2166136261;
  for (const value of data) hash = Math.imul(hash ^ value, 16777619);
  return hash >>> 0;
}

function pixel(data: Uint8ClampedArray, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return Array.from(data.slice(offset, offset + 4));
}

/** Completed RGBA frames from a deliberately asymmetric, neutral test image with transparent and translucent pixels. */
export function renderTransitionEffects() {
  const source = fixture();
  const canvas = new OffscreenCanvas(128, 96);
  const context = canvas.getContext('2d')!;
  context.drawImage(source, destination.x, destination.y);
  const expected = pixels(context);
  return presets.map((preset) => {
    const paint = (progress: number, edge: 'entry' | 'exit' = 'entry') => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#11213d';
      context.fillRect(1, 1, 3, 3);
      drawTransitionEffect(context, source, destination, { preset, progress, edge });
      return pixels(context);
    };
    const start = paint(0);
    const middle = paint(0.4);
    const outside = Array.from(context.getImageData(1, 1, 1, 1).data);
    const clearMargin = Array.from(context.getImageData(115, 30, 1, 1).data);
    const forwardHash = digest(middle);
    const late = paint(0.86);
    const reverse = paint(0.4);
    const finish = paint(1);
    let changed = 0;
    let maximumError = 0;
    let startAlpha = 0;
    let chromaticPixels = 0;
    for (let index = 0; index < expected.length; index++) {
      maximumError = Math.max(maximumError, Math.abs(finish[index]! - expected[index]!));
      if (index % 4 !== 0) continue;
      if (
        Array.from(middle.slice(index, index + 4)).some(
          (value, channel) => Math.abs(value - expected[index + channel]!) > 8,
        )
      )
        changed++;
      startAlpha += start[index + 3]!;
      if (
        middle[index + 3]! > 32 &&
        Math.max(middle[index]!, middle[index + 1]!, middle[index + 2]!) -
          Math.min(middle[index]!, middle[index + 1]!, middle[index + 2]!) >
          12
      )
        chromaticPixels++;
    }
    const exit = paint(0.4, 'exit');
    return {
      kind: preset.kind,
      maximumError,
      changed,
      startAlpha,
      startColor: pixel(start, 40, 32),
      transparentStart: pixel(start, 90, 4),
      transparentFinish: pixel(finish, 90, 4),
      translucentFinish: pixel(finish, 80, 55),
      outside,
      clearMargin,
      reverseStable: forwardHash === digest(reverse),
      progressing: forwardHash !== digest(late),
      hash: forwardHash,
      exitHash: digest(exit),
      chromaticPixels,
      center: pixel(middle, 48, 32),
      corner: pixel(middle, 4, 4),
      left: pixel(middle, 4, 32),
      right: pixel(middle, 90, 32),
    };
  });
}
