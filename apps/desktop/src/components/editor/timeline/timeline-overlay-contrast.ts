import { inject, type ObjectDirective } from 'vue';
import { sampleCanvasControlTone } from '~/ui/ResizeHandle/canvas-control-contrast';
import type { TimelineOverlayContrast } from './timeline-overlay-contrast-types';
import { TIMELINE_OVERLAY_CONTRAST_KEY } from './timeline-overlay-contrast-types';

/** One 64px artwork probe for the visible timeline, excluding its own text and badges. */
export function createTimelineOverlayContrast(invalidate: () => void): TimelineOverlayContrast {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 64;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const elements = new Set<HTMLElement | SVGElement>();
  let pixels: ImageData | null = null;
  let source: HTMLCanvasElement | null = null;
  let sampling = false;
  let bounds: DOMRect | null = null;
  let colors: { light: string; dark: string } | null = null;
  let lastSample = -Infinity;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  let blocked: HTMLCanvasElement | null = null;
  const at: TimelineOverlayContrast['at'] = (x, y) => {
    if (!pixels || !bounds || !colors || !bounds.width || !bounds.height) return null;
    const tone = sampleCanvasControlTone(pixels, x / bounds.width, y / bounds.height);
    if (!tone) return null;
    return tone === 'dark'
      ? { foreground: colors.light, background: colors.dark }
      : { foreground: colors.dark, background: colors.light };
  };
  return {
    register(element) {
      elements.add(element);
      invalidate();
      return () => elements.delete(element);
    },
    at,
    prepare(canvas, rect, width, height) {
      bounds = rect;
      source = canvas;
      sampling = false;
      if (!ctx || canvas === blocked || !width || !height || !rect.width || !rect.height) return null;
      const elapsed = performance.now() - lastSample;
      if (elapsed < 125) {
        trailing ??= setTimeout(() => {
          trailing = null;
          invalidate();
        }, 125 - elapsed);
        return null;
      }
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
      lastSample = performance.now();
      sampling = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 64, 64);
      ctx.setTransform(64 / width, 0, 0, 64 / height, 0, 0);
      return ctx;
    },
    capture() {
      if (sampling && ctx && source) {
        sampling = false;
        try {
          pixels = ctx.getImageData(0, 0, 64, 64);
          const style = getComputedStyle(source);
          const light = style.getPropertyValue('--text-light').trim();
          const dark = style.getPropertyValue('--canvas-control-dark').trim();
          colors = light && dark ? { light, dark } : null;
        } catch {
          // Keep the opposing badge surface when pixels cannot be inspected (e.g. cross-origin media).
          blocked = source;
          pixels = null;
          colors = null;
          probe.width = 64;
        }
      }
      if (!bounds) return;
      const rect = bounds;
      for (const element of elements) {
        const box = element.getBoundingClientRect();
        const color = at(box.left + box.width / 2 - rect.left, box.top + box.height / 2 - rect.top);
        for (const [key, value] of [
          ['--timeline-overlay-ink', color?.foreground],
          ['--timeline-overlay-background', color?.background],
        ] as const) {
          if (value) {
            if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
          } else element.style.removeProperty(key);
        }
      }
    },
    dispose() {
      if (trailing !== null) clearTimeout(trailing);
      trailing = null;
      elements.clear();
      pixels = null;
      bounds = null;
      colors = null;
      blocked = null;
      source = null;
      sampling = false;
      probe.width = probe.height = 0;
    },
  };
}

export function useTimelineOverlayContrast(): ObjectDirective<HTMLElement | SVGElement> {
  const context = inject(TIMELINE_OVERLAY_CONTRAST_KEY, null);
  const releases = new WeakMap<Element, () => void>();
  return {
    mounted: (element) => {
      if (context) releases.set(element, context.register(element));
    },
    unmounted: (element) => {
      releases.get(element)?.();
      releases.delete(element);
    },
  };
}
