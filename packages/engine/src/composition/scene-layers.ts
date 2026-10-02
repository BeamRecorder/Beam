import { scenePaintOrder } from '../scene/scene-order';
import { mayBeEnabled } from '@beam/engine/scene/scene-visibility';
import { sourceTimeAt } from '@beam/engine';
import { createTimelineIntervalIndex } from '@beam/engine/shared/timeline-interval-index';
import { createOrderedTimelineIndex } from '@beam/engine/shared/ordered-timeline-index';
import { timingPreviewFor } from '@beam/engine/composition/timing-preview';
import { compileSceneComposition } from '../scene/scene-clock';
import { createSceneAnimator } from '../scene/scene-animation';
import type { SceneGraph } from '../scene/scene-types';
import type {
  BlurClip,
  CaptionClip,
  Clip,
  ClipComposition,
  ColorClip,
  ShapeClip,
  VisualClip,
} from '@beam/engine/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  webcams: VisualClip[];
  visualStack: Array<VisualClip | ColorClip | ShapeClip | BlurClip>;
  captions: CaptionClip[];
  scene?: SceneGraph;
}

export type CompositionSceneLayerResolver = (timeMs: number) => CompositionSceneLayers;

// Camera simulation needs only the foremost screen, at up to 120 samples/sec.
// Keep annotations out of its temporal queries and sorting entirely.
export function createCompositionScreenResolver(composition: ClipComposition): (timeMs: number) => VisualClip | null {
  const paintOrder = scenePaintOrder(composition);
  const animate = createSceneAnimator(composition);
  composition = compileSceneComposition(composition);
  const preview = timingPreviewFor(composition);
  if (preview)
    return (timeMs) => {
      let foremost: VisualClip | null = null;
      for (const entry of preview.at(timeMs, true)) {
        const clip = animate(entry, timeMs);
        if (!clip.enabled) continue;
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
  const screens = composition.clips.filter(
    (clip): clip is VisualClip => mayBeEnabled(composition, clip) && clip.kind === 'screen',
  );
  const order = new Map(screens.map((clip, index) => [clip.id, index]));
  const screensAt = createTimelineIntervalIndex(
    screens.map((clip) => ({
      start: clip.timelineStartMs,
      end: clip.timelineStartMs + clip.timelineDurationMs,
      value: clip,
    })),
  );
  return (timeMs) => {
    let foremost: VisualClip | null = null;
    for (const entry of screensAt(timeMs)) {
      const clip = animate(entry, timeMs);
      if (!clip.enabled) continue;
      if (sourceTimeAt(clip, timeMs) === null) continue;
      if (
        !foremost ||
        (paintOrder
          ? paintOrder.get(clip.id)! > paintOrder.get(foremost.id)!
          : clip.order > foremost.order ||
            (clip.order === foremost.order && order.get(clip.id)! < order.get(foremost.id)!))
      )
        foremost = clip;
    }
    return foremost;
  };
}

export function createCompositionSceneLayerResolver(composition: ClipComposition): CompositionSceneLayerResolver {
  const authored = composition;
  const paintOrder = scenePaintOrder(authored);
  const animate = createSceneAnimator(authored);
  const animatedGroups = new Set(authored.animations?.tracks.map((track) => track.targetId));
  const animateGroups = authored.scene?.groups.some((group) => animatedGroups.has(group.id));
  composition = compileSceneComposition(composition);
  const preview = timingPreviewFor(composition);
  const order = preview ? null : new Map(composition.clips.map((clip, index) => [clip, index]));
  const byDescendingOrder = (left: Clip, right: Clip) =>
    right.order - left.order ||
    (preview ? preview.order(left) - preview.order(right) : order!.get(left)! - order!.get(right)!);
  const clipsAt = preview
    ? (timeMs: number) => preview.at(timeMs).sort(byDescendingOrder)
    : createOrderedTimelineIndex(
        composition.clips
          .filter((clip) => mayBeEnabled(composition, clip) && clip.kind !== 'audio')
          .map((clip) => ({
            start: clip.timelineStartMs,
            end: clip.timelineStartMs + clip.timelineDurationMs,
            value: clip,
          })),
        byDescendingOrder,
      );

  return (timeMs) => {
    const cameraVisuals: VisualClip[] = [];
    const webcams: VisualClip[] = [];
    const visualStack: Array<VisualClip | ColorClip | ShapeClip | BlurClip> = [];
    const captions: CaptionClip[] = [];
    let screen: VisualClip | null = null;

    for (const entry of clipsAt(timeMs)) {
      const clip = animate(entry, timeMs);
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
      if (clip.kind === 'screen' && (!screen || (paintOrder && paintOrder.get(clip.id)! > paintOrder.get(screen.id)!)))
        screen = clip;
      cameraVisuals.push(clip);
      visualStack.push(clip);
    }

    return {
      screen,
      cameraVisuals,
      webcams,
      visualStack,
      captions,
      ...(authored.scene
        ? {
            scene: animateGroups
              ? { ...authored.scene, groups: authored.scene.groups.map((group) => animate(group, timeMs)) }
              : authored.scene,
          }
        : {}),
    };
  };
}

export function resolveCompositionSceneLayers(composition: ClipComposition, timeMs: number): CompositionSceneLayers {
  return createCompositionSceneLayerResolver(composition)(timeMs);
}
