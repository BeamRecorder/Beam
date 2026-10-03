import { isVisualClip, isCaptionClip, isShapeClip, type ClipComposition } from '../shared/composition-types';
import { normalizeMediaRotation } from '../layout/media-rotation';
import { updateClip } from './clip-engine';
import { CompositionEngineError } from './clip-composition-validation';

export function setClipRotation(composition: ClipComposition, clipId: string, degrees: number): ClipComposition {
  const rotation = normalizeMediaRotation(degrees);
  return updateClip(composition, clipId, (clip) => {
    if (!(isVisualClip(clip) || isCaptionClip(clip) || isShapeClip(clip)))
      throw new CompositionEngineError('Only media, text and shape clips can rotate.');
    return { ...clip, rotation };
  });
}
