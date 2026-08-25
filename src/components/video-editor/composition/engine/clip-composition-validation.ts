import {
  COMPOSITION_SCHEMA_VERSION,
  isAudioClip,
  isBlurClip,
  isCaptionClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type ClipComposition,
} from '~/media/shared/composition-types';
import { isColorFill, isPhoneFrameFill } from '~/media/shared/color-fill-types';
import { isColorLayerStyle } from '~/media/shared/color-layer-style';
import { isShapeLayerStyle } from '~/media/shared/shape-layer-style';
import { normalizeClipTransitions } from '~/media/shared/clip-transitions';
import { isCameraFramingPreset, isCameraLayoutPreset, isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { assertValidVisualTracks } from './visual-track-layout';

export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 4;
export const MIN_CLIP_DURATION_MS = 40;

export class CompositionEngineError extends Error {}

const finite = (value: number) => Number.isFinite(value);

export function validateComposition(composition: ClipComposition): void {
  if (
    !composition ||
    composition.schemaVersion !== COMPOSITION_SCHEMA_VERSION ||
    !Array.isArray(composition.assets) ||
    !Array.isArray(composition.clips) ||
    !Array.isArray(composition.keyboardCaptionSessions) ||
    composition.keyboardCaptionSessions.some((sessionId) => typeof sessionId !== 'string' || !sessionId)
  ) {
    throw new CompositionEngineError('Invalid composition schema.');
  }
  const assetIds = new Set<string>();
  for (const asset of composition.assets) {
    if (
      !asset?.id ||
      assetIds.has(asset.id) ||
      !['video', 'image', 'audio'].includes(asset.kind) ||
      !finite(asset.durationMs) ||
      asset.durationMs < 0
    ) {
      throw new CompositionEngineError('Invalid media asset.');
    }
    assetIds.add(asset.id);
  }
  const clipIds = new Set<string>();
  const groupTiming = new Map<string, string>();
  for (const clip of composition.clips) {
    if (
      !clip?.id ||
      clipIds.has(clip.id) ||
      !['screen', 'video', 'image', 'webcam', 'color', 'shape', 'blur', 'audio', 'caption'].includes(clip.kind)
    ) {
      throw new CompositionEngineError('Invalid clip identity.');
    }
    clipIds.add(clip.id);
    if (
      ![
        clip.timelineStartMs,
        clip.timelineDurationMs,
        clip.sourceInMs,
        clip.sourceDurationMs,
        clip.playbackRate,
        clip.order,
      ].every(finite) ||
      clip.timelineStartMs < 0 ||
      clip.timelineDurationMs < MIN_CLIP_DURATION_MS ||
      clip.sourceInMs < 0 ||
      clip.sourceDurationMs <= 0 ||
      clip.playbackRate < MIN_PLAYBACK_RATE ||
      clip.playbackRate > MAX_PLAYBACK_RATE
    ) {
      throw new CompositionEngineError('Invalid clip timing.');
    }
    if (!clip.transitions) throw new CompositionEngineError('Missing clip transitions.');
    const normalizedTransitions = normalizeClipTransitions(clip.transitions, clip.timelineDurationMs, clip.kind);
    if (JSON.stringify(normalizedTransitions) !== JSON.stringify(clip.transitions))
      throw new CompositionEngineError('Invalid clip transitions.');
    const expectedTimelineDuration = clip.sourceDurationMs / clip.playbackRate;
    if (Math.abs(expectedTimelineDuration - clip.timelineDurationMs) > 2) {
      throw new CompositionEngineError('Clip source and timeline durations disagree.');
    }
    if (
      clip.kind !== 'caption' &&
      !isColorClip(clip) &&
      !isShapeClip(clip) &&
      !isBlurClip(clip) &&
      !assetIds.has(clip.assetId)
    )
      throw new CompositionEngineError(`Missing asset for clip: ${clip.id}`);
    if (clip.kind === 'caption') {
      const caption = clip.caption;
      const textCaption = caption?.type === 'text' && Array.isArray(caption.sentences);
      const keyboardCaption =
        caption?.type === 'keyboard' &&
        Array.isArray(caption.steps) &&
        caption.steps.length > 0 &&
        typeof caption.followCursor === 'boolean' &&
        Boolean(caption.sourceSessionId);
      if (!textCaption && !keyboardCaption) throw new CompositionEngineError('Invalid caption clip.');
    }
    if (
      (isVisualClip(clip) || isColorClip(clip) || isShapeClip(clip) || isBlurClip(clip)) &&
      (![clip.transform.x, clip.transform.y, clip.transform.width, clip.transform.height].every(finite) ||
        clip.transform.width <= 0 ||
        clip.transform.height <= 0)
    ) {
      throw new CompositionEngineError('Invalid visual transform.');
    }
    if (
      isVisualClip(clip) &&
      ((clip.freezeFrameSourceMs !== undefined &&
        (!finite(clip.freezeFrameSourceMs) ||
          clip.freezeFrameSourceMs !== clip.sourceInMs ||
          composition.assets.find((asset) => asset.id === clip.assetId)?.kind !== 'video')) ||
        (clip.kind === 'image' && clip.freezeFrameSourceMs !== undefined) ||
        (clip.cameraLayoutPreset !== undefined && !isCameraLayoutPreset(clip.cameraLayoutPreset)) ||
        (clip.cameraFramingPreset !== undefined && !isCameraFramingPreset(clip.cameraFramingPreset)) ||
        (clip.kind !== 'webcam' &&
          clip.cameraLayoutPreset !== undefined &&
          isSplitCameraLayout(clip.cameraLayoutPreset)) ||
        (clip.kind === 'webcam' &&
          (!isCameraLayoutPreset(clip.cameraLayoutPreset) || !isCameraFramingPreset(clip.cameraFramingPreset))) ||
        (clip.kind === 'webcam' &&
          (!finite(clip.cameraSplitRatio ?? Number.NaN) ||
            clip.cameraSplitRatio! < 0.2 ||
            clip.cameraSplitRatio! > 0.8 ||
            !finite(clip.cameraSplitPadding ?? Number.NaN) ||
            clip.cameraSplitPadding! < 0 ||
            clip.cameraSplitPadding! > 0.08 ||
            (clip.reactToZoom !== undefined && typeof clip.reactToZoom !== 'boolean'))) ||
        (clip.kind !== 'webcam' && clip.reactToZoom !== undefined))
    ) {
      throw new CompositionEngineError('Invalid visual preset.');
    }
    if (
      isVisualClip(clip) &&
      clip.appearance.phoneFrameFill !== undefined &&
      !isPhoneFrameFill(clip.appearance.phoneFrameFill)
    )
      throw new CompositionEngineError('Invalid phone frame fill.');
    if (isBlurClip(clip)) {
      if (
        !['rectangle', 'square', 'circle'].includes(clip.shape) ||
        !['blur', 'frosted', 'pixelated', 'opaque'].includes(clip.mode)
      )
        throw new CompositionEngineError('Invalid blur effect.');
      if (
        ![clip.strength, clip.feather, clip.tintOpacity].every(finite) ||
        clip.strength < 0 ||
        clip.strength > 100 ||
        clip.feather < 0 ||
        clip.feather > 100 ||
        (clip.cornerRadius !== undefined &&
          (!finite(clip.cornerRadius) || clip.cornerRadius < 0 || clip.cornerRadius > 100)) ||
        clip.tintOpacity < 0 ||
        clip.tintOpacity > 100 ||
        !/^#[\da-f]{6}$/i.test(clip.color)
      )
        throw new CompositionEngineError('Invalid blur effect settings.');
    }
    if (isColorClip(clip) && (clip.assetId !== '' || !isColorFill(clip.fill) || !isColorLayerStyle(clip)))
      throw new CompositionEngineError('Invalid color clip settings.');
    if (isShapeClip(clip) && (clip.assetId !== '' || !isShapeLayerStyle(clip)))
      throw new CompositionEngineError('Invalid shape clip settings.');
    if (isAudioClip(clip) && (!finite(clip.volume) || clip.volume < 0 || clip.volume > 200))
      throw new CompositionEngineError('Invalid clip volume.');
    if (
      isCaptionClip(clip) &&
      clip.captionLayerId !== undefined &&
      (typeof clip.captionLayerId !== 'string' || !clip.captionLayerId.trim())
    )
      throw new CompositionEngineError('Invalid caption layer identity.');
    if (clip.groupId) {
      const timing = `${clip.timelineStartMs}:${clip.timelineDurationMs}:${clip.playbackRate}`;
      const known = groupTiming.get(clip.groupId);
      if (known && known !== timing) throw new CompositionEngineError('Grouped clips must share timeline timing.');
      groupTiming.set(clip.groupId, timing);
    }
  }
  assertValidVisualTracks(composition.clips, (message) => {
    throw new CompositionEngineError(message);
  });
}
