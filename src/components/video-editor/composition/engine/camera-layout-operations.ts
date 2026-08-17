import { isSplitCameraLayout, type CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import type { ClipComposition, NormalizedTransform } from '~/media/shared/composition-types';
import { cameraLayoutTransform, linkedScreenTransform } from '../camera-layout';
import { cameraScreenCanShareGroup, cameraScreenPartner } from '../camera-screen-link';
import { CompositionEngineError, validateComposition } from './clip-composition-validation';

export function setCameraLayout(
  composition: ClipComposition,
  clipId: string,
  preset: Exclude<CameraLayoutPreset, 'custom'>,
): ClipComposition {
  const next = JSON.parse(JSON.stringify(composition)) as ClipComposition;
  const camera = next.clips.find((clip) => clip.id === clipId);
  if (!camera) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  if (camera.kind !== 'webcam') throw new CompositionEngineError('Only camera clips have camera layouts.');
  const needsScreenPartner =
    isSplitCameraLayout(preset) || (camera.cameraLayoutPreset ? isSplitCameraLayout(camera.cameraLayoutPreset) : false);
  const linkedScreen = cameraScreenPartner(next, camera, needsScreenPartner);
  if (isSplitCameraLayout(preset) && !linkedScreen) {
    throw new CompositionEngineError('A split camera layout requires a linked screen clip.');
  }
  const splitRatio = camera.cameraSplitRatio ?? 0.5;
  const splitPadding = camera.cameraSplitPadding ?? 0;
  const inferredGroupId =
    isSplitCameraLayout(preset) &&
    linkedScreen &&
    cameraScreenCanShareGroup(camera, linkedScreen) &&
    (!camera.groupId || !linkedScreen.groupId || linkedScreen.groupId !== camera.groupId)
      ? (camera.groupId ?? linkedScreen.groupId ?? crypto.randomUUID())
      : undefined;
  next.clips = next.clips.map((clip) => {
    if (clip.id === camera.id) {
      return {
        ...clip,
        ...(inferredGroupId ? { groupId: inferredGroupId } : {}),
        transform: cameraLayoutTransform(preset, splitRatio, splitPadding),
        crop: undefined,
        cameraLayoutPreset: preset,
        cameraFramingPreset: preset === 'fullscreen' || isSplitCameraLayout(preset) ? 'fill' : 'squircle',
      };
    }
    if (linkedScreen && clip.id === linkedScreen.id) {
      return {
        ...clip,
        ...(inferredGroupId ? { groupId: inferredGroupId } : {}),
        transform: linkedScreenTransform(preset, splitRatio, splitPadding),
      };
    }
    return clip;
  });
  validateComposition(next);
  return next;
}

export function setCameraSplitRatio(composition: ClipComposition, clipId: string, ratio: number): ClipComposition {
  const next = JSON.parse(JSON.stringify(composition)) as ClipComposition;
  const camera = next.clips.find((clip) => clip.id === clipId);
  if (!camera) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  if (camera.kind !== 'webcam' || !camera.cameraLayoutPreset || !isSplitCameraLayout(camera.cameraLayoutPreset))
    throw new CompositionEngineError('Only split camera layouts have an adjustable ratio.');
  const linkedScreen = cameraScreenPartner(next, camera, true);
  if (!linkedScreen) throw new CompositionEngineError('A split camera layout requires a linked screen clip.');
  const splitRatio = Math.max(0.2, Math.min(0.8, ratio));
  const splitPadding = camera.cameraSplitPadding ?? 0;
  next.clips = next.clips.map((clip) =>
    clip.id === camera.id
      ? {
          ...clip,
          cameraSplitRatio: splitRatio,
          transform: cameraLayoutTransform(camera.cameraLayoutPreset!, splitRatio, splitPadding),
        }
      : clip.id === linkedScreen.id
        ? { ...clip, transform: linkedScreenTransform(camera.cameraLayoutPreset!, splitRatio, splitPadding) }
        : clip,
  );
  validateComposition(next);
  return next;
}

export function setCameraSplitPadding(composition: ClipComposition, clipId: string, padding: number): ClipComposition {
  const next = JSON.parse(JSON.stringify(composition)) as ClipComposition;
  const camera = next.clips.find((clip) => clip.id === clipId);
  if (!camera) throw new CompositionEngineError(`Unknown clip: ${clipId}`);
  if (camera.kind !== 'webcam' || !camera.cameraLayoutPreset || !isSplitCameraLayout(camera.cameraLayoutPreset))
    throw new CompositionEngineError('Only split camera layouts have adjustable padding.');
  const linkedScreen = cameraScreenPartner(next, camera, true);
  if (!linkedScreen) throw new CompositionEngineError('A split camera layout requires a linked screen clip.');
  const splitPadding = Math.max(0, Math.min(0.08, padding));
  const splitRatio = camera.cameraSplitRatio ?? 0.5;
  next.clips = next.clips.map((clip) =>
    clip.id === camera.id
      ? {
          ...clip,
          cameraSplitPadding: splitPadding,
          transform: cameraLayoutTransform(camera.cameraLayoutPreset!, splitRatio, splitPadding),
        }
      : clip.id === linkedScreen.id
        ? { ...clip, transform: linkedScreenTransform(camera.cameraLayoutPreset!, splitRatio, splitPadding) }
        : clip,
  );
  validateComposition(next);
  return next;
}

export function setCameraSplitTransform(
  composition: ClipComposition,
  clipId: string,
  transform: NormalizedTransform,
): ClipComposition {
  const camera = composition.clips.find((clip) => clip.id === clipId);
  if (camera?.kind !== 'webcam' || !camera.cameraLayoutPreset || !isSplitCameraLayout(camera.cameraLayoutPreset))
    throw new CompositionEngineError('Only split camera layouts use split transforms.');
  const vertical = camera.cameraLayoutPreset === 'split-left' || camera.cameraLayoutPreset === 'split-right';
  const padding = (1 - (vertical ? transform.height : transform.width)) / 2;
  const ratio = (vertical ? transform.width : transform.height) + Math.max(0, padding) * 2;
  return setCameraSplitPadding(setCameraSplitRatio(composition, clipId, ratio), clipId, padding);
}
