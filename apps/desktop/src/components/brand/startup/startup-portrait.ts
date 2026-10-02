import { createBeamyMotion } from '../Beamy/beamy-motion';
import type { StartupPortrait } from './startup-types';

/** The bootstrap uses the same shape engine without loading Vue to paint it. */
export function animateStartupPortrait(element: HTMLElement): StartupPortrait {
  const body = element.querySelector<SVGPathElement>('.startup-body');
  const eyes = [...element.querySelectorAll<SVGPathElement>('.startup-eyes')];
  const dots = [...element.querySelectorAll<SVGCircleElement>('.startup-dots circle')];
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches;
  let disposed = false;
  const sample = createBeamyMotion('loading');
  let elapsed = 0;
  let frame = 0;
  let previous: number | null = null;
  let lastDraw = -Infinity;
  const draw = () => {
    const motion = sample(elapsed, reduced);
    body?.setAttribute('d', motion.frame.bodyPath);
    body?.setAttribute('opacity', String(motion.frame.bodyAlpha));
    eyes.forEach((path, index) => {
      const eye = motion.frame.eyes[index];
      path.setAttribute('opacity', String(eye?.alpha ?? 0));
      if (!eye) return;
      path.setAttribute('d', eye.d);
      path.setAttribute('transform', eye.matrix);
    });
    dots.forEach((circle, index) => {
      const dot = motion.frame.dots[index];
      circle.setAttribute('opacity', String(dot?.opacity ?? 0));
      if (!dot) return;
      circle.setAttribute('cx', String(dot.x));
      circle.setAttribute('cy', String(dot.y));
      circle.setAttribute('r', String(dot.r));
    });
  };
  const tick = (time: number) => {
    elapsed += previous === null ? 0 : Math.max(0, Math.min(100, time - previous)) / 1000;
    previous = time;
    if (time - lastDraw >= 1000 / 30) {
      draw();
      lastDraw = time;
    }
    frame = 0;
    frame = requestAnimationFrame(tick);
  };
  const synchronize = () => {
    cancelAnimationFrame(frame);
    previous = null;
    lastDraw = -Infinity;
    draw();
    if (!disposed && body && !document.hidden && !reduced) frame = requestAnimationFrame(tick);
  };
  const changed = (event: MediaQueryListEvent) => {
    reduced = event.matches;
    synchronize();
  };
  media.addEventListener('change', changed);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      media.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', synchronize);
    },
  };
}
