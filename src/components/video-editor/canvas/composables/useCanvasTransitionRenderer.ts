import { EMPTY_CLIP_TRANSITIONS, resolveCanvasTransitionState } from '~/media/shared/clip-transitions';
import type { OutputCanvasSettings } from '../output-canvas';
import { OUTPUT_PREVIEW_RADIUS, outputPreviewRect } from '../output-canvas';
import { drawCanvasTransitionFrame } from '../../composition/transitions/render-canvas-transition';

export function useCanvasTransitionRenderer(options: {
  outputCanvas: () => OutputCanvasSettings;
  currentTime: () => number;
  duration: () => number;
  logicalSize: () => { width: number; height: number };
  deviceScale: () => number;
  fallbackColor: string;
}) {
  let surface: HTMLCanvasElement | null = null;

  const render = (ctx: CanvasRenderingContext2D, drawScene: (target: CanvasRenderingContext2D) => void) => {
    const size = options.logicalSize();
    const transition = resolveCanvasTransitionState(
      options.outputCanvas().transitions ?? EMPTY_CLIP_TRANSITIONS,
      options.currentTime() * 1_000,
      options.duration() * 1_000,
    );
    if (!transition) {
      drawScene(ctx);
      return;
    }

    surface ??= document.createElement('canvas');
    const scale = options.deviceScale();
    surface.width = Math.max(1, Math.round(size.width * scale));
    surface.height = Math.max(1, Math.round(size.height * scale));
    const surfaceContext = surface.getContext('2d');
    if (!surfaceContext) {
      drawScene(ctx);
      return;
    }
    surfaceContext.setTransform(scale, 0, 0, scale, 0, 0);
    surfaceContext.clearRect(0, 0, size.width, size.height);
    surfaceContext.imageSmoothingEnabled = true;
    surfaceContext.imageSmoothingQuality = 'high';
    drawScene(surfaceContext);

    const frame = outputPreviewRect(size.width, size.height, options.outputCanvas());
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(frame.x, frame.y, frame.width, frame.height, OUTPUT_PREVIEW_RADIUS);
    ctx.clip();
    drawCanvasTransitionFrame(ctx, surface, size, frame, transition, options.fallbackColor);
    ctx.restore();
  };

  return { render };
}
