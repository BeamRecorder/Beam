import { cropSourceDimensions } from '../composition/crop/crop-pixels';
import { computed, ref, watch, type Ref } from 'vue';
import {
  isAudioClip,
  isBlurClip,
  isCaptionClip,
  isColorClip,
  isShapeClip,
  isVisualClip,
  type BlurClip,
  type CaptionClip,
  type ClipAppearance,
  type ClipComposition,
  type NormalizedCrop,
  type NormalizedTransform,
} from '~/media/shared/composition-types';
import type { CameraFramingPreset, CameraLayoutPreset } from '~/media/shared/camera-layout-types';
import { isSplitCameraLayout } from '~/media/shared/camera-layout-types';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { cameraScreenPartner } from '../composition/camera-screen-link';
import { applyCaptionSelectionUpdate } from '../composition/caption-selection';
import {
  deleteClip,
  detachClip,
  setAppearance,
  setBlurEffect,
  setCameraFraming,
  setCameraLayout,
  setCameraSplitPadding,
  setCameraSplitRatio,
  setClipEnabled,
  setCrop,
  setMirrored,
  setMirroredY,
  setPlaybackRate,
  setTransform,
  setVolume,
  setWebcamReactToZoom,
} from '../composition/engine/clip-engine';

export function useSelectedClips(options: { composition: Ref<ClipComposition>; activeTab: Ref<string> }) {
  const selectedClipId = ref<string | null>(null);
  const selectedClipIds = ref<string[]>([]);
  const selectedClips = computed(() => {
    const byId = new Map(options.composition.value.clips.map((clip) => [clip.id, clip]));
    return selectedClipIds.value.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  });
  const selectedClip = computed(
    () => options.composition.value.clips.find((clip) => clip.id === selectedClipId.value) ?? null,
  );
  const selectedCaptionClip = computed(() =>
    selectedClip.value && isCaptionClip(selectedClip.value) ? selectedClip.value : null,
  );
  const selectedWebcamClip = computed(() => (selectedClip.value?.kind === 'webcam' ? selectedClip.value : null));
  const allSelectedEnabled = computed(() => selectedClips.value.every((clip) => clip.enabled));

  watch(
    selectedClipId,
    (id) => {
      if (!id) selectedClipIds.value = [];
      else if (!selectedClipIds.value.includes(id)) selectedClipIds.value = [id];
    },
    { flush: 'sync' },
  );
  watch(
    () => options.composition.value.clips.map((clip) => clip.id),
    (validIds) => {
      const valid = new Set(validIds);
      selectedClipIds.value = selectedClipIds.value.filter((id) => valid.has(id));
      if (selectedClipId.value && !valid.has(selectedClipId.value)) selectedClipId.value = null;
    },
  );

  const selectClips = (clipIds: readonly string[], primaryClipId?: string | null) => {
    const valid = new Set(options.composition.value.clips.map((clip) => clip.id));
    const ids = [...new Set(clipIds)].filter((id) => valid.has(id));
    if (clipIds.length && !ids.length) return;
    selectedClipIds.value = ids;
    selectedClipId.value = primaryClipId && ids.includes(primaryClipId) ? primaryClipId : (ids[0] ?? null);
    if (ids.length) options.activeTab.value = 'clip';
  };
  const selectClip = (clipId: string) => selectClips([clipId], clipId);

  const updateEach = (
    accepts: (clip: (typeof selectedClips.value)[number]) => boolean,
    update: (id: string) => void,
  ) => {
    for (const clip of selectedClips.value) if (accepts(clip)) update(clip.id);
  };
  const updateCompositionEach = (
    accepts: (clip: (typeof selectedClips.value)[number]) => boolean,
    update: (composition: ClipComposition, clipId: string) => ClipComposition,
  ) => {
    let next = options.composition.value;
    updateEach(accepts, (id) => {
      next = update(next, id);
    });
    options.composition.value = next;
  };

  const selectedClipInfo = computed(() => {
    const clip = selectedClip.value;
    if (!clip) return null;
    return {
      id: clip.id,
      kind: clip.kind,
      name: clip.name,
      timelineStartMs: clip.timelineStartMs,
      timelineDurationMs: clip.timelineDurationMs,
      playbackRate: clip.playbackRate,
      enabled: allSelectedEnabled.value,
      isLinked: Boolean(clip.groupId),
      ...(isAudioClip(clip) ? { volume: clip.volume, normalization: clip.normalization } : {}),
      ...(isVisualClip(clip)
        ? {
            crop: clip.crop,
            cropDimensions: cropSourceDimensions(options.composition.value, clip),
            isMirrored: clip.isMirrored,
            isMirroredY: clip.isMirroredY,
            clipTransform: clip.transform,
            ...clip.appearance,
            cameraLayoutPreset: clip.cameraLayoutPreset ?? 'custom',
            cameraFramingPreset: clip.cameraFramingPreset ?? 'custom',
            ...(clip.kind === 'webcam'
              ? {
                  cameraSplitRatio: clip.cameraSplitRatio ?? 0.5,
                  cameraSplitPadding: clip.cameraSplitPadding ?? 0,
                  reactToZoom: clip.reactToZoom ?? !isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom'),
                  hasLinkedScreen: Boolean(cameraScreenPartner(options.composition.value, clip, true)),
                }
              : {}),
          }
        : {}),
      ...(isBlurClip(clip)
        ? {
            clipTransform: clip.transform,
            blurShape: clip.shape,
            blurMode: clip.mode,
            blurStrength: clip.strength,
            blurFeather: clip.feather,
            blurCornerRadius: clip.cornerRadius,
            blurTintOpacity: clip.tintOpacity,
            blurColor: clip.color,
          }
        : {}),
      ...(isColorClip(clip) || isShapeClip(clip) ? { clipTransform: clip.transform } : {}),
    };
  });

  const updateCaption = (caption: CaptionClip) => {
    options.composition.value = applyCaptionSelectionUpdate(options.composition.value, selectedClipIds.value, caption);
  };
  const deleteSelectedClip = () => {
    let next = options.composition.value;
    for (const id of selectedClipIds.value)
      if (next.clips.some((clip) => clip.id === id)) next = deleteClip(next, id, true);
    options.composition.value = next;
    selectedClipId.value = null;
  };
  const updateSelectedAppearance = (patch: Partial<ClipAppearance>) =>
    updateCompositionEach(isVisualClip, (next, id) => {
      const clip = next.clips.find((item) => item.id === id);
      if (!clip || !isVisualClip(clip)) return next;
      return setAppearance(next, id, { ...createDefaultClipAppearance(clip.kind), ...clip.appearance, ...patch });
    });
  const updateSelectedTransform = (transform: NormalizedTransform) =>
    updateCompositionEach(
      (clip) => !isAudioClip(clip),
      (next, id) => setTransform(next, id, transform),
    );
  const updateSelectedBlur = (
    patch: Partial<
      Pick<BlurClip, 'shape' | 'mode' | 'strength' | 'feather' | 'cornerRadius' | 'tintOpacity' | 'color'>
    >,
  ) => updateCompositionEach(isBlurClip, (next, id) => setBlurEffect(next, id, patch));
  const updateSelectedCrop = (crop: NormalizedCrop) =>
    updateCompositionEach(isVisualClip, (next, id) => setCrop(next, id, crop));
  const updateSelectedVisual = (update: (composition: ClipComposition, clipId: string) => ClipComposition) =>
    updateCompositionEach(isVisualClip, update);
  const updateSelectedCameraLayout = (preset: Exclude<CameraLayoutPreset, 'custom'>) =>
    updateSelectedVisual((next, id) => setCameraLayout(next, id, preset));
  const updateSelectedCameraFraming = (preset: Exclude<CameraFramingPreset, 'custom'>) =>
    updateSelectedVisual((next, id) => setCameraFraming(next, id, preset));
  const updateSelectedCameraSplitRatio = (ratio: number) =>
    updateSelectedVisual((next, id) => setCameraSplitRatio(next, id, ratio));
  const updateSelectedCameraSplitPadding = (padding: number) =>
    updateSelectedVisual((next, id) => setCameraSplitPadding(next, id, padding));
  const updateSelectedWebcamReactToZoom = (reactToZoom: boolean) =>
    updateCompositionEach(
      (clip) => clip.kind === 'webcam',
      (next, id) => setWebcamReactToZoom(next, id, reactToZoom),
    );
  const updateSelectedMirrored = (mirrored: boolean) =>
    updateCompositionEach(isVisualClip, (next, id) => setMirrored(next, id, mirrored));
  const updateSelectedMirroredY = (mirroredY: boolean) =>
    updateCompositionEach(isVisualClip, (next, id) => setMirroredY(next, id, mirroredY));
  const updateSelectedRate = (rate: number) =>
    updateCompositionEach(
      (clip) => !isCaptionClip(clip) && !isColorClip(clip) && !isShapeClip(clip) && !isBlurClip(clip),
      (next, id) => setPlaybackRate(next, id, rate),
    );
  const updateSelectedVolume = (volume: number) =>
    updateCompositionEach(isAudioClip, (next, id) => setVolume(next, id, volume));
  const updateSelectedEnabled = (enabled: boolean) =>
    updateCompositionEach(
      () => true,
      (next, id) => setClipEnabled(next, id, enabled),
    );
  const detachSelectedClip = () =>
    updateCompositionEach(
      () => true,
      (next, id) => detachClip(next, id),
    );

  return {
    selectedClipId,
    selectedClipIds,
    selectedClips,
    selectedClip,
    selectedClipInfo,
    selectedCaptionClip,
    selectedWebcamClip,
    selectClip,
    selectClips,
    updateCaption,
    deleteSelectedClip,
    updateSelectedAppearance,
    updateSelectedTransform,
    updateSelectedBlur,
    updateSelectedCrop,
    updateSelectedCameraLayout,
    updateSelectedCameraFraming,
    updateSelectedCameraSplitRatio,
    updateSelectedCameraSplitPadding,
    updateSelectedWebcamReactToZoom,
    updateSelectedMirrored,
    updateSelectedMirroredY,
    updateSelectedRate,
    updateSelectedVolume,
    updateSelectedEnabled,
    detachSelectedClip,
  };
}
