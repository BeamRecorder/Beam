import { BEAMY_SETTLE_SECONDS, createBeamyMotion } from '../Beamy/beamy-motion';
import type { StartupPortrait } from './startup-types';

/** The bootstrap uses the same shape engine without loading Vue to paint it. */
export function animateStartupPortrait(element: HTMLElement): StartupPortrait {
  const body = element.querySelector<SVGPathElement>('.startup-cloud');
  const eyes = [...element.querySelectorAll<SVGPathElement>('.startup-eyes')];
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches;
  let disposed = false;
  let sample = createBeamyMotion('processing');
  let motion = sample(0, reduced);
  let elapsed = 0;
  let settling: number | null = null;
  let from = motion.shape;
  let frame = 0;
  let previous: number | null = null;
  let lastDraw = -Infinity;
  const draw = () => {
    motion = sample(elapsed, reduced, from, settling === null ? 1 : (elapsed - settling) / BEAMY_SETTLE_SECONDS);
    body?.setAttribute('d', motion.frame.bodyPath);
    eyes.forEach((path, index) => {
      const eye = motion.frame.eyes[index]!;
      path.setAttribute('d', eye.d);
      path.setAttribute('transform', eye.matrix);
    });
  };
  const tick = (time: number) => {
    elapsed += previous === null ? 0 : Math.max(0, Math.min(100, time - previous)) / 1000;
    previous = time;
    if (time - lastDraw >= 1000 / 30 || (settling !== null && elapsed - settling >= BEAMY_SETTLE_SECONDS)) {
      draw();
      lastDraw = time;
    }
    frame = 0;
    if (settling === null || elapsed - settling < BEAMY_SETTLE_SECONDS) frame = requestAnimationFrame(tick);
  };
  const synchronize = () => {
    cancelAnimationFrame(frame);
    previous = null;
    lastDraw = -Infinity;
    draw();
    if (
      !disposed &&
      body &&
      !document.hidden &&
      !reduced &&
      (settling === null || elapsed - settling < BEAMY_SETTLE_SECONDS)
    )
      frame = requestAnimationFrame(tick);
  };
  const changed = (event: MediaQueryListEvent) => {
    reduced = event.matches;
    synchronize();
  };
  media.addEventListener('change', changed);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
  return {
    settle: () => {
      from = motion.shape;
      settling = elapsed;
      sample = createBeamyMotion('idle');
      synchronize();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      media.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', synchronize);
    },
  };
}
