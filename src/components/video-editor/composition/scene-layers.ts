import { activeClipsAt } from '~/media/shared';
import type { CaptionClip, ClipComposition, VisualClip } from '~/media/shared/composition-types';

export interface CompositionSceneLayers {
  screen: VisualClip | null;
  cameraVisuals: VisualClip[];
  viewportVisuals: VisualClip[];
  webcams: VisualClip[];
  captions: CaptionClip[];
}

export function resolveCompositionSceneLayers(composition: ClipComposition, timeMs: number): CompositionSceneLayers {
  const active = activeClipsAt(composition, timeMs);
  const byOrder = <T extends { order: number }>(left: T, right: T) => right.order - left.order;
  const screen = active.filter((clip): clip is VisualClip => clip.kind === 'screen').sort(byOrder);
  return {
    screen: screen[0] ?? null,
    cameraVisuals: screen,
    viewportVisuals: active
      .filter((clip): clip is VisualClip => clip.kind === 'video' || clip.kind === 'image')
      .sort(byOrder),
    webcams: active.filter((clip): clip is VisualClip => clip.kind === 'webcam').sort(byOrder),
    captions: active.filter((clip): clip is CaptionClip => clip.kind === 'caption').sort(byOrder),
  };
}
