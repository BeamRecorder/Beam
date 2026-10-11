import {
  captionLayerKey,
  clipEndMs,
  isTextCaptionClip,
  type CaptionClip,
  type ClipComposition,
} from '@beam/engine/shared/composition-types';
import { addClip } from '@beam/engine/commands/clip-engine';

/** A timeline insertion joins the requested layer; a toolbar insertion creates its own layer. */
export function insertTextCaption(
  composition: ClipComposition,
  caption: CaptionClip,
  targetClipId?: string,
): ClipComposition | null {
  if (!isTextCaptionClip(caption)) return null;
  if (targetClipId === undefined) return addClip(composition, caption);
  const target = composition.clips.find((clip) => clip.id === targetClipId);
  if (!target || !isTextCaptionClip(target)) return null;
  const key = captionLayerKey(target);
  const layer = composition.clips.filter(isTextCaptionClip).filter((clip) => captionLayerKey(clip) === key);
  if (
    layer.some((clip) => clip.locked) ||
    layer.some((clip) => clip.timelineStartMs < clipEndMs(caption) && caption.timelineStartMs < clipEndMs(clip))
  )
    return null;
  const layerId = target.captionLayerId ?? target.id;
  const source = target.captionLayerId
    ? composition
    : {
        ...composition,
        clips: composition.clips.map((clip) =>
          isTextCaptionClip(clip) && captionLayerKey(clip) === key ? { ...clip, captionLayerId: layerId } : clip,
        ),
      };
  return addClip(source, { ...caption, captionLayerId: layerId, order: target.order });
}
