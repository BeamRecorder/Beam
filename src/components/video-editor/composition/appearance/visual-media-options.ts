import { isVisualClip, type Clip, type VisualClip } from '~/media/shared/composition-types';
import { resolveVisualClipFraming } from '../visual-framing';
import type { AdaptiveShadowRequest, DecoratedMediaOptions, VisualMediaSource } from './appearance-types';

export function visualMediaOptions(
  clip: VisualClip,
  media: VisualMediaSource,
  canvas: { width: number; height: number },
): DecoratedMediaOptions {
  const t = clip.transform;
  const rect = {
    x: t.x * canvas.width,
    y: t.y * canvas.height,
    width: t.width * canvas.width,
    height: t.height * canvas.height,
  };
  const framing = resolveVisualClipFraming(clip, rect, media.width, media.height);
  return {
    source: media.source,
    sourceRect: framing.sourceRect,
    rect: framing.rect,
    appearance: clip.appearance,
    title: clip.name,
    mirrored: clip.isMirrored,
    mirroredY: clip.isMirroredY,
    mask: framing.mask,
    shadowFollowsSourceAlpha: clip.kind === 'image',
  };
}

export function visualAdaptiveShadowRequests(
  clips: readonly Clip[],
  visuals: ReadonlyMap<string, VisualMediaSource> | undefined,
  canvas: { width: number; height: number },
): AdaptiveShadowRequest[] {
  const requests: AdaptiveShadowRequest[] = [];
  for (const clip of clips) {
    if (
      !isVisualClip(clip) ||
      clip.kind === 'screen' ||
      clip.kind === 'webcam' ||
      clip.appearance.shadowMode !== 'adaptive' ||
      clip.appearance.shadowSize === 'none'
    )
      continue;
    const media = visuals?.get(clip.id);
    if (!media) continue;
    const options = visualMediaOptions(clip, media, canvas);
    requests.push({
      source: options.source,
      sourceRect: options.sourceRect,
      fallbackColor: clip.appearance.shadowColor,
    });
  }
  return requests;
}
