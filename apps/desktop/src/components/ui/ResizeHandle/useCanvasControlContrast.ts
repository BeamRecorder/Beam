import { inject, onBeforeUnmount, provide, type InjectionKey, type ObjectDirective } from 'vue';
import { sampleCanvasControlsTone } from './canvas-control-contrast';
import type { CanvasControlContrast } from './canvas-control-contrast-types';
const KEY: InjectionKey<CanvasControlContrast> = Symbol('canvas-control-contrast');

/** One bounded readback shared by all visible controls; never sample the full-resolution canvas. */
export function createCanvasControlContrast(source: () => HTMLCanvasElement | null): CanvasControlContrast {
  const elements = new Set<HTMLElement | SVGElement>();
  const probe = document.createElement('canvas');
  probe.width = probe.height = 64;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  let frame = 0,
    lastSample = -Infinity;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  let blocked: HTMLCanvasElement | null = null;
  const tick = (time: number) => {
    frame = 0;
    if (!elements.size) return;
    if (time - lastSample < 125) {
      trailing = setTimeout(
        () => {
          trailing = null;
          refresh();
        },
        125 - (time - lastSample),
      );
      return;
    }
    if (!ctx) return;
    lastSample = time;
    const canvas = source();
    if (!canvas || canvas === blocked || !canvas.width || !canvas.height) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    let pixels: ImageData;
    try {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(canvas, 0, 0, 64, 64);
      pixels = ctx.getImageData(0, 0, 64, 64);
    } catch {
      // A tainted or unavailable canvas keeps the neutral two-tone controls readable.
      blocked = canvas;
      probe.width = 64;
      return;
    }
    const points = [...elements].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: (rect.left + rect.width / 2 - bounds.left) / bounds.width,
        y: (rect.top + rect.height / 2 - bounds.top) / bounds.height,
      };
    });
    const tone = sampleCanvasControlsTone(pixels, points);
    const ink = tone === 'dark' ? 'var(--canvas-control-dark)' : tone === 'light' ? 'var(--text-light)' : '';
    const halo = tone === 'dark' ? 'var(--text-light)' : tone === 'light' ? 'var(--canvas-control-dark)' : '';
    for (const element of elements) {
      if (element.style.getPropertyValue('--canvas-control-ink') === ink) continue;
      if (tone) {
        element.style.setProperty('--canvas-control-ink', ink);
        element.style.setProperty('--canvas-control-halo', halo);
      } else {
        element.style.removeProperty('--canvas-control-ink');
        element.style.removeProperty('--canvas-control-halo');
      }
    }
  };
  const refresh = () => {
    if (elements.size && !frame && trailing === null) frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    if (trailing !== null) clearTimeout(trailing);
    trailing = null;
    frame = 0;
  };
  return {
    refresh,
    register: (element) => {
      elements.add(element);
      refresh();
      return () => {
        elements.delete(element);
        if (!elements.size) stop();
      };
    },
    dispose: () => {
      stop();
      elements.clear();
      blocked = null;
    },
  };
}

export function provideCanvasControlContrast(source: () => HTMLCanvasElement | null) {
  const context = createCanvasControlContrast(source);
  provide(KEY, context);
  onBeforeUnmount(context.dispose);
  return context;
}

export function useCanvasControlContrast(): ObjectDirective<HTMLElement | SVGElement> {
  const context = inject(KEY, null);
  const releases = new WeakMap<Element, () => void>();
  return {
    mounted: (element) => {
      if (context) releases.set(element, context.register(element));
    },
    updated: () => context?.refresh(),
    unmounted: (element) => {
      releases.get(element)?.();
      releases.delete(element);
    },
  };
}
