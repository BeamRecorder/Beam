import { sourceTimeAt } from '~/media/shared';
import { createTimelineIntervalIndex } from '~/media/shared/timeline-interval-index';
import { timingPreviewFor } from './timing-preview';
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

// Camera simulation needs only the foremost screen, at up to 120 samples/sec.
// Keep annotations out of its temporal queries and sorting entirely.
export function createCompositionScreenResolver(composition: ClipComposition): (timeMs: number) => VisualClip | null {
  const preview = timingPreviewFor(composition);
  if (preview)
    return (timeMs) => {
      let foremost: VisualClip | null = null;
      for (const clip of preview.at(timeMs, true)) {
        if (clip.kind !== 'screen' || sourceTimeAt(clip, timeMs) === null) continue;
        if (
          !foremost ||
          clip.order > foremost.order ||
          (clip.order === foremost.order && preview.order(clip) < preview.order(foremost))
        )
          foremost = clip;
      }
      return foremost;
    };
  const screens = composition.clips.filter((clip): clip is VisualClip => clip.enabled && clip.kind === 'screen');
  const order = new Map(screens.map((clip, index) => [clip, index]));
  const screensAt = createTimelineIntervalIndex(
    screens.map((clip) => ({
      start: clip.timelineStartMs,
      end: clip.timelineStartMs + clip.timelineDurationMs,
      value: clip,
    })),
  );
  return (timeMs) => {
    let foremost: VisualClip | null = null;
    for (const clip of screensAt(timeMs)) {
      if (sourceTimeAt(clip, timeMs) === null) continue;
      if (
        !foremost ||
        clip.order > foremost.order ||
        (clip.order === foremost.order && order.get(clip)! < order.get(foremost)!)
      )
        foremost = clip;
    }
    return foremost;
  };
}

export function createCompositionSceneLayerResolver(composition: ClipComposition): CompositionSceneLayerResolver {
  const preview = timingPreviewFor(composition);
  const order = preview ? null : new Map(composition.clips.map((clip, index) => [clip, index]));
  const clipsAt = preview
    ? preview.at
    : createTimelineIntervalIndex(
        composition.clips
          .filter((clip) => clip.enabled && clip.kind !== 'audio')
          .map((clip) => ({
            start: clip.timelineStartMs,
            end: clip.timelineStartMs + clip.timelineDurationMs,
            value: clip,
          })),
      );
  const byDescendingOrder = (left: Clip, right: Clip) =>
    right.order - left.order ||
    (preview ? preview.order(left) - preview.order(right) : order!.get(left)! - order!.get(right)!);

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
