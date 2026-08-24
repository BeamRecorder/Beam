import { sourceTimeAt } from '~/media/shared';
import type { BlurClip, CaptionClip, Clip, ClipComposition, VisualClip } from '~/media/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  webcams: VisualClip[];
  visualStack: Array<VisualClip | BlurClip>;
  captions: CaptionClip[];
}

export type CompositionSceneLayerResolver = (timeMs: number) => CompositionSceneLayers;

const byDescendingOrder = (left: Clip, right: Clip) => right.order - left.order;

export function createCompositionSceneLayerResolver(composition: ClipComposition): CompositionSceneLayerResolver {
  const clips = [...composition.clips].sort(byDescendingOrder);

  return (timeMs) => {
    const cameraVisuals: VisualClip[] = [];
    const webcams: VisualClip[] = [];
    const visualStack: Array<VisualClip | BlurClip> = [];
    const captions: CaptionClip[] = [];
    let screen: VisualClip | null = null;

    for (const clip of clips) {
      if (clip.kind === 'audio' || !clip.enabled || sourceTimeAt(clip, timeMs) === null) continue;
      if (clip.kind === 'caption') {
        captions.push(clip);
        continue;
      }
      if (clip.kind === 'blur') {
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
