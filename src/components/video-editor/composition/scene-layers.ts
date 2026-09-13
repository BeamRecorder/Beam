import { sourceTimeAt } from '~/media/shared';
import { createTimelineIntervalIndex } from '~/media/shared/timeline-interval-index';
import type {
  BlurClip,
  CaptionClip,
  Clip,
  ClipComposition,
  ColorClip,
  ShapeClip,
  VisualClip,
} from '~/media/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  webcams: VisualClip[];
  visualStack: Array<VisualClip | ColorClip | ShapeClip | BlurClip>;
  captions: CaptionClip[];
}

export type CompositionSceneLayerResolver = (timeMs: number) => CompositionSceneLayers;

export function createCompositionSceneLayerResolver(composition: ClipComposition): CompositionSceneLayerResolver {
  const order = new Map(composition.clips.map((clip, index) => [clip, index]));
  const clipsAt = createTimelineIntervalIndex(
    composition.clips
      .filter((clip) => clip.enabled && clip.kind !== 'audio')
      .map((clip) => ({
        start: clip.timelineStartMs,
        end: clip.timelineStartMs + clip.timelineDurationMs,
        value: clip,
      })),
  );
  const byDescendingOrder = (left: Clip, right: Clip) =>
    right.order - left.order || order.get(left)! - order.get(right)!;

  return (timeMs) => {
    const cameraVisuals: VisualClip[] = [];
    const webcams: VisualClip[] = [];
    const visualStack: Array<VisualClip | ColorClip | ShapeClip | BlurClip> = [];
    const captions: CaptionClip[] = [];
    let screen: VisualClip | null = null;

    for (const clip of clipsAt(timeMs).sort(byDescendingOrder)) {
      if (clip.kind === 'audio' || !clip.enabled || sourceTimeAt(clip, timeMs) === null) continue;
      if (clip.kind === 'caption') {
        captions.push(clip);
        continue;
      }
      if (clip.kind === 'color' || clip.kind === 'shape' || clip.kind === 'blur') {
        visualStack.push(clip);
        continue;
      }
      if (clip.kind === 'webcam') {
        webcams.push(clip);
        visualStack.push(clip);
        continue;
      }
      if (clip.kind === 'screen') screen ??= clip;
      cameraVisuals.push(clip);
      visualStack.push(clip);
    }

    return { screen, cameraVisuals, webcams, visualStack, captions };
  };
}

export function resolveCompositionSceneLayers(composition: ClipComposition, timeMs: number): CompositionSceneLayers {
  return createCompositionSceneLayerResolver(composition)(timeMs);
}
