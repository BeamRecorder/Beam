import { resolveCanvasTransitionState } from '../../../packages/engine/src/shared/clip-transitions';
import { drawWithClipTransition } from '../../../packages/runtime/src/composition/transitions/render-transition';
import { drawCanvasTransitionFrame } from '../../../packages/runtime/src/composition/transitions/render-canvas-transition';
import { drawShapeClip } from '../../../packages/runtime/src/composition/shape/render-shape-clip';
import { elementClips, previewClip } from './scene-model';
import { phaseTime, transitionState } from './motion';
import type { DemoMode } from './demo-types';

export function paintPreview(canvas: HTMLCanvasElement, image: HTMLImageElement, mode: DemoMode, time: number) {
  const context = canvas.getContext('2d')!,
    { width, height } = canvas;
  const frame = { x: 0, y: 0, width, height };
  const color = getComputedStyle(canvas).getPropertyValue('--color-bg-well');
  context.clearRect(0, 0, width, height);
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  if (mode === 'export') {
    context.drawImage(image, 0, 0, width, height);
    return;
  }
  const state = transitionState(time),
    clip = previewClip(time);
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const source = surface.getContext('2d')!;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const w = width / scale,
    h = height / scale;
  drawWithClipTransition(source, clip, state.previewMs, frame, () => {
    source.drawImage(image, (image.naturalWidth - w) / 2, (image.naturalHeight - h) / 2, w, h, 0, 0, width, height);
  });
  for (const element of elementClips(time)) {
    drawWithClipTransition(source, element, phaseTime(time) * 1000, frame, () => drawShapeClip(source, element, frame));
  }
  const canvasTransition = state.canvas
    ? resolveCanvasTransitionState(
        {
          entry: {
            preset: state.preset,
            durationMs: state.duration,
            easingPower: 3,
          },
          exit: null,
        },
        state.previewMs,
        8000,
      )
    : null;
  if (canvasTransition) drawCanvasTransitionFrame(context, surface, frame, frame, canvasTransition, color);
  else context.drawImage(surface, 0, 0);
}
