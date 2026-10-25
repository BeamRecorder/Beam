import type { Canvas2DContext } from '@beam/runtime/canvas-types';
import type { TransitionEffectState } from '@beam/engine/shared/transition-types';
import type { TransitionEffectRect } from './transition-effect-types';
import { TransitionEffectRenderer } from './transition-effect-renderer';

let renderer: TransitionEffectRenderer | undefined;
export function drawTransitionEffect(
  ctx: Canvas2DContext,
  source: CanvasImageSource,
  frame: TransitionEffectRect,
  effect: TransitionEffectState,
  region: TransitionEffectRect = { x: 0, y: 0, width: 1, height: 1 },
) {
  if (
    ![frame.x, frame.y, frame.width, frame.height, region.x, region.y, region.width, region.height].every(
      Number.isFinite,
    ) ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    region.width <= 0 ||
    region.height <= 0
  )
    throw new RangeError('Invalid transition geometry.');
  renderer ??= new TransitionEffectRenderer();
  const size =
    'videoWidth' in source
      ? { width: source.videoWidth, height: source.videoHeight }
      : 'naturalWidth' in source
        ? { width: source.naturalWidth, height: source.naturalHeight }
        : 'displayWidth' in source
          ? { width: source.displayWidth, height: source.displayHeight }
          : source;
  const width = Number(size.width),
    height = Number(size.height);
  const image = renderer.render(source, width, height, effect, region);
  ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);
}
export function disposeTransitionEffects() {
  renderer?.dispose();
  renderer = undefined;
}
