import { activeClipsAt } from '~/media/shared';
import type { CaptionClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  webcams: VisualClip[];
  captions: CaptionClip[];
}

export function resolveCompositionSceneLayers(composition: ClipComposition, timeMs: number): CompositionSceneLayers {
  const active = activeClipsAt(composition, timeMs);
  const byOrder = <T extends { order: number }>(left: T, right: T) => right.order - left.order;
  const cameraVisuals = active
    .filter((clip): clip is VisualClip => ['screen', 'video', 'image'].includes(clip.kind))
    .sort(byOrder);
  return {
    screen: cameraVisuals.find((clip) => clip.kind === 'screen') ?? null,
    cameraVisuals,
    webcams: active.filter((clip): clip is VisualClip => clip.kind === 'webcam').sort(byOrder),
    captions: active.filter((clip): clip is CaptionClip => clip.kind === 'caption').sort(byOrder),
  };
}
