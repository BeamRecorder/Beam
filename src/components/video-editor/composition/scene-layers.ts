import { activeClipsAt } from '~/media/shared';
import type { BlurClip, CaptionClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  webcams: VisualClip[];
  visualStack: Array<VisualClip | BlurClip>;
  captions: CaptionClip[];
}

export function resolveCompositionSceneLayers(composition: ClipComposition, timeMs: number): CompositionSceneLayers {
  const active = activeClipsAt(composition, timeMs);
  const byOrder = <T extends { order: number }>(left: T, right: T) => right.order - left.order;
  const screen = active.filter((clip): clip is VisualClip => clip.kind === 'screen').sort(byOrder);
  const cameraVisuals = active
    .filter((clip): clip is VisualClip => clip.kind === 'screen' || clip.kind === 'video' || clip.kind === 'image')
    .sort(byOrder);
  const visualStack = active
    .filter(
      (clip): clip is VisualClip | BlurClip =>
        clip.kind === 'screen' ||
        clip.kind === 'video' ||
        clip.kind === 'image' ||
        clip.kind === 'webcam' ||
        clip.kind === 'blur',
    )
    .sort(byOrder);
  return {
    screen: screen[0] ?? null,
    cameraVisuals,
    webcams: active.filter((clip): clip is VisualClip => clip.kind === 'webcam').sort(byOrder),
    visualStack,
    captions: active.filter((clip): clip is CaptionClip => clip.kind === 'caption').sort(byOrder),
  };
}
