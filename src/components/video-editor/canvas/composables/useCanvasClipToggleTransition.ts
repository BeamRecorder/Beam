import { onUnmounted, watch } from 'vue';
import type { ClipComposition } from '~/media/shared/composition-types';

export const CLIP_TOGGLE_FADE_MS = 160;

interface CanvasClipToggleTransitionOptions {
  canvas: () => HTMLCanvasElement | null;
  composition: () => ClipComposition;
  onRenderOnce: () => void;
  now?: () => number;
  prefersReducedMotion?: () => boolean;
}

const visualEnabledStates = (composition: ClipComposition) =>
  new Map(
    composition.clips.flatMap((clip) =>
      clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'webcam'
        ? [[clip.id, clip.enabled] as const]
        : [],
    ),
  );

const enabledSignature = (composition: ClipComposition) =>
  [...visualEnabledStates(composition)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, enabled]) => `${id}:${enabled ? 1 : 0}`)
    .join('|');

export function useCanvasClipToggleTransition(options: CanvasClipToggleTransitionOptions) {
  let previousStates = visualEnabledStates(options.composition());
  let snapshot: HTMLCanvasElement | null = null;
  let startedAt = 0;
  const now = options.now ?? (() => performance.now());
  const prefersReducedMotion =
    options.prefersReducedMotion ??
    (() =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const clear = () => {
    snapshot = null;
  };

  const capture = () => {
    const canvas = options.canvas();
    if (!canvas?.width || !canvas.height || prefersReducedMotion()) {
      clear();
      return;
    }
    const previousFrame = document.createElement('canvas');
    previousFrame.width = canvas.width;
    previousFrame.height = canvas.height;
    const context = previousFrame.getContext('2d');
    if (!context) return;
    context.drawImage(canvas, 0, 0);
    snapshot = previousFrame;
    startedAt = now();
    options.onRenderOnce();
  };

  watch(
    () => enabledSignature(options.composition()),
    () => {
      const nextStates = visualEnabledStates(options.composition());
      const didToggle = [...nextStates].some(
        ([clipId, enabled]) => previousStates.has(clipId) && previousStates.get(clipId) !== enabled,
      );
      previousStates = nextStates;
      if (didToggle) capture();
    },
  );

  const blendPreviousFrame = (context: CanvasRenderingContext2D, width: number, height: number) => {
    if (!snapshot) return false;
    const progress = Math.min(1, Math.max(0, (now() - startedAt) / CLIP_TOGGLE_FADE_MS));
    if (progress >= 1) {
      clear();
      return false;
    }
    const easedProgress = progress * progress * (3 - 2 * progress);
    context.save();
    context.globalAlpha = 1 - easedProgress;
    context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height);
    context.restore();
    options.onRenderOnce();
    return true;
  };

  onUnmounted(clear);
  return { blendPreviousFrame };
}
