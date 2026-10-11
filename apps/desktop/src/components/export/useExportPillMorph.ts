import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import type { ExportMorphSource } from './export-status-types';

export function captureExportMorph(element?: HTMLElement | null): ExportMorphSource | null {
  if (!element) return null;
  const { left, top, width, height } = element.getBoundingClientRect();
  if (width <= 0 || height <= 0) return null;
  const snapshot = element.cloneNode(true) as HTMLElement;
  snapshot.removeAttribute('role');
  snapshot.removeAttribute('aria-modal');
  for (const node of [snapshot, ...snapshot.querySelectorAll('[id]')]) node.removeAttribute('id');
  snapshot.style.cssText = 'width:100%;height:100%;max-width:none;max-height:none;pointer-events:none;';
  return { left, top, width, height, snapshot };
}

export function useExportPillMorph(host: Ref<HTMLElement | null>, source?: ExportMorphSource | null) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const morphing = ref(Boolean(source) && !reduced);
  const ghost = ref<HTMLElement | null>(null);
  let animation: Animation | null = null;
  let contentAnimation: Animation | null = null;
  let disposed = false;
  onMounted(async () => {
    await nextTick();
    const target = host.value?.querySelector('.snip-pill');
    if (disposed || !morphing.value || !source || !target || !ghost.value?.animate) {
      morphing.value = false;
      return;
    }
    const destination = target.getBoundingClientRect();
    if (source.snapshot) {
      ghost.value.append(source.snapshot);
      contentAnimation = source.snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards' });
    }
    animation = ghost.value.animate(
      [
        {
          transform: 'translate3d(0, 0, 0) scale(1, 1)',
          borderRadius: '16px',
          opacity: 1,
        },
        {
          transform: `translate3d(${destination.left - source.left}px, ${destination.top - source.top}px, 0) scale(${destination.width / source.width}, ${destination.height / source.height})`,
          borderRadius: '24px',
          opacity: 0.85,
        },
      ],
      {
        duration: 280,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'forwards',
      },
    );
    try {
      await animation.finished;
    } catch {
      // Leaving the editor cancels the decorative surface, never the export.
    } finally {
      morphing.value = false;
      animation?.cancel();
      contentAnimation?.cancel();
      animation = null;
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
    animation?.cancel();
    contentAnimation?.cancel();
  });
  return { ghost, morphing };
}
