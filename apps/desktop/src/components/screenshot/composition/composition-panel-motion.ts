import type { CompositionPanelRect } from './composition-panel-types';

/** Animate a child so pointer-driven translation on the panel itself stays independent. */
export function animateCompositionPanel(panel: HTMLElement, from: CompositionPanelRect): Animation | null {
  const surface = panel.querySelector<HTMLElement>('.composition-motion');
  if (!surface || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const to = surface.getBoundingClientRect();
  const scale = panel.getBoundingClientRect().width / panel.offsetWidth;
  if (!from.width || !from.height || !to.width || !to.height || !Number.isFinite(scale) || scale <= 0) return null;
  return surface.animate(
    [
      {
        transform: `translate(${(from.left - to.left) / scale}px, ${(from.top - to.top) / scale}px) scale(${from.width / to.width}, ${from.height / to.height})`,
      },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ],
    { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
}
