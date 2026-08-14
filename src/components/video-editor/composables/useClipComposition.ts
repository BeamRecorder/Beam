import { computed, ref, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import { inspectMedia, mediaSourceDescriptor, type DroppedMediaInspection } from '~/media/shared';
import {
  emptyComposition,
  isAudioClip,
  isCaptionClip,
  isVisualClip,
  type AudioClip,
  type CaptionClip,
  type Clip,
  type ClipAppearance,
  type ClipComposition,
  type MediaAsset,
  type NormalizedCrop,
  type NormalizedTransform,
  type VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  addClip,
  createComposition,
  deleteClip,
  detachClip,
  moveClip,
  setAppearance,
  setClipEnabled,
  setCrop,
  setMirrored,
  setMirroredY,
  setPlaybackRate,
  setTransform,
  setVolume,
  splitClip,
  trimClip,
  updateClip,
} from '../composition/engine/clip-engine';
import { synchronizeRecordingClips } from '../composition/session-clips';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const endMs = (clip: Clip) => clip.timelineStartMs + clip.timelineDurationMs;

export function useClipComposition(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  currentTimeSec: Ref<number>;
  activeTab: Ref<string>;
}) {
  const composition = ref<ClipComposition>(emptyComposition());
  const selectedClipId = ref<string | null>(null);

  const selectedClip = computed(() => composition.value.clips.find((clip) => clip.id === selectedClipId.value) ?? null);
  const selectedCaptionClip = computed(() =>
    selectedClip.value && isCaptionClip(selectedClip.value) ? selectedClip.value : null,
  );
  const selectedWebcamClip = computed(() => (selectedClip.value?.kind === 'webcam' ? selectedClip.value : null));

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
      enabled: clip.enabled,
      isLinked: Boolean(clip.groupId),
      ...(isAudioClip(clip) ? { volume: clip.volume } : {}),
      ...(isVisualClip(clip)
        ? {
            isMirrored: clip.isMirrored,
            isMirroredY: clip.isMirroredY,
            clipTransform: clip.transform,
            ...clip.appearance,
          }
        : {}),
    };
  });

  const clipsBy = (predicate: (clip: Clip) => boolean) => computed(() => composition.value.clips.filter(predicate));
  const screenClips = clipsBy((clip) => clip.kind === 'screen');
  const webcamClips = clipsBy((clip) => clip.kind === 'webcam');
  const systemAudioClips = clipsBy((clip) => isAudioClip(clip) && clip.role === 'system');
  const microphoneClips = clipsBy((clip) => isAudioClip(clip) && clip.role === 'microphone');
  const everyEnabled = (clips: Ref<Clip[]>) =>
    computed({
      get: () => clips.value.length === 0 || clips.value.some((clip) => clip.enabled),
      set: (enabled: boolean) => {
        let next = composition.value;
        for (const clip of clips.value) next = setClipEnabled(next, clip.id, enabled);
        composition.value = next;
      },
    });
  const isVideoEnabled = everyEnabled(screenClips);
  const isWebcamEnabled = everyEnabled(webcamClips);
  const isSystemAudioEnabled = everyEnabled(systemAudioClips);
  const isMicAudioEnabled = everyEnabled(microphoneClips);

  const selectClip = (clipId: string) => {
    if (!composition.value.clips.some((clip) => clip.id === clipId)) return;
    selectedClipId.value = clipId;
    options.activeTab.value = 'clip';
  };

  const synchronizeRecording = () => {
    composition.value = synchronizeRecordingClips(composition.value, options.editorData.value);
  };

  const addImportedAsset = (
    asset: MediaAsset,
    inspection: DroppedMediaInspection,
    requestedStartMs = options.currentTimeSec.value * 1_000,
  ) => {
    if (asset.kind !== inspection.kind) throw new Error('Le type du média importé est incohérent.');
    const startMs = Math.max(0, Math.round(requestedStartMs));
    const duration = Math.round(inspection.durationMs);
    if (duration <= 0) throw new Error('Le média importé ne contient aucune durée exploitable.');
    const normalizedAsset: MediaAsset = {
      ...asset,
      durationMs: duration,
      width: inspection.width ?? asset.width,
      height: inspection.height ?? asset.height,
    };

    if (asset.kind === 'audio') {
      const audio: AudioClip = {
        id: crypto.randomUUID(),
        kind: 'audio',
        name: asset.name,
        assetId: asset.id,
        role: 'imported',
        timelineStartMs: startMs,
        timelineDurationMs: duration,
        sourceInMs: 0,
        sourceDurationMs: duration,
        playbackRate: 1,
        enabled: true,
        order: composition.value.clips.length,
        volume: 100,
      };
      composition.value = addClip(composition.value, audio, normalizedAsset);
      selectClip(audio.id);
      return audio.id;
    }

    const groupId =
      asset.kind === 'video' && inspection.hasAudio && inspection.canDecodeAudio ? crypto.randomUUID() : undefined;
    const topVisualOrder = Math.min(0, ...composition.value.clips.filter(isVisualClip).map((clip) => clip.order)) - 1;
    const visual: VisualClip = {
      id: crypto.randomUUID(),
      kind: asset.kind,
      name: asset.name,
      assetId: asset.id,
      timelineStartMs: startMs,
      timelineDurationMs: duration,
      sourceInMs: 0,
      sourceDurationMs: duration,
      playbackRate: 1,
      enabled: true,
      order: topVisualOrder,
      groupId,
      transform: { x: 0, y: 0, width: 1, height: 1 },
      appearance: createDefaultClipAppearance(asset.kind),
      isMirrored: false,
      isMirroredY: false,
    };
    let next = addClip(composition.value, visual, normalizedAsset);
    if (groupId) {
      const audio: AudioClip = {
        id: crypto.randomUUID(),
        kind: 'audio',
        name: `${asset.name} audio`,
        assetId: asset.id,
        role: 'imported',
        timelineStartMs: startMs,
        timelineDurationMs: duration,
        sourceInMs: 0,
        sourceDurationMs: duration,
        playbackRate: 1,
        enabled: true,
        order: next.clips.length,
        groupId,
        volume: 100,
      };
      next = addClip(next, audio);
    }
    composition.value = next;
    selectClip(visual.id);
    return visual.id;
  };

  const addElement = async (kind: 'video' | 'image' | 'sound' | 'caption', requestedStartMs?: number) => {
    const startMs = Math.max(0, Math.round(requestedStartMs ?? options.currentTimeSec.value * 1_000));
    if (kind === 'caption') {
      const clip: CaptionClip = {
        id: crypto.randomUUID(),
        kind: 'caption',
        name: 'Caption',
        timelineStartMs: startMs,
        timelineDurationMs: 2_000,
        sourceInMs: 0,
        sourceDurationMs: 2_000,
        playbackRate: 1,
        enabled: true,
        order: 0,
        caption: {
          sentences: [],
          style: createDefaultCaptionStyle(),
        },
      };
      composition.value = addClip(composition.value, clip);
      selectClip(clip.id);
      return;
    }
    if (!options.project.value) return;
    const asset = await capture.pickProjectMedia(options.project.value.id, kind === 'sound' ? 'audio' : kind);
    if (!asset) return;
    if (asset.kind === 'image') {
      addImportedAsset(
        asset,
        {
          kind: 'image',
          durationMs: 5_000,
          width: asset.width,
          height: asset.height,
          hasAudio: false,
          canDecodeAudio: false,
          audioCodec: null,
        },
        startMs,
      );
      return;
    }
    const inspection = await inspectMedia(mediaSourceDescriptor(asset));
    const videoMetadata = inspection.metadata.videoTracks[0];
    const audioMetadata = inspection.metadata.audioTracks[0];
    addImportedAsset(
      asset,
      {
        kind: asset.kind,
        durationMs: Math.round(inspection.metadata.durationSeconds * 1_000),
        width: videoMetadata?.displayWidth ?? null,
        height: videoMetadata?.displayHeight ?? null,
        hasAudio: inspection.capabilities.hasAudio,
        canDecodeAudio: audioMetadata?.canDecode ?? false,
        audioCodec: audioMetadata?.codec ?? null,
      },
      startMs,
    );
  };

  const addCaptionAtTime = (startMs: number) => addElement('caption', startMs);

  const updateCaption = (caption: CaptionClip) => {
    composition.value = updateClip(composition.value, caption.id, () => clone(caption));
  };

  const previewClipEdge = (clipId: string, edge: 'start' | 'end', timeMs: number) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || clip.timelineDurationMs <= 80) return;
    const clamped = Math.max(clip.timelineStartMs + 40, Math.min(endMs(clip) - 40, Math.round(timeMs)));
    composition.value = trimClip(composition.value, clipId, edge, clamped);
  };

  const trimClipEdge = (clipId: string, edge: 'start' | 'end', timeMs: number) => previewClipEdge(clipId, edge, timeMs);
  const previewMoveClip = (clipId: string, startMs: number) => {
    composition.value = moveClip(composition.value, clipId, startMs);
  };
  const moveClipTo = (clipId: string, startMs: number) => previewMoveClip(clipId, startMs);
  const splitSelectedClip = () => {
    const clip = selectedClip.value;
    const timeMs = Math.round(options.currentTimeSec.value * 1_000);
    if (!clip || timeMs <= clip.timelineStartMs || timeMs >= endMs(clip)) return;
    composition.value = splitClip(composition.value, clip.id, timeMs);
  };
  const deleteSelectedClip = () => {
    if (!selectedClipId.value) return;
    composition.value = deleteClip(composition.value, selectedClipId.value);
    selectedClipId.value = null;
  };
  const reorderVisualClip = (clipId: string, targetIndex: number) => {
    const ordered = [...composition.value.clips].sort((left, right) => left.order - right.order);
    const visuals = ordered.filter(isVisualClip);
    const sourceIndex = visuals.findIndex((clip) => clip.id === clipId);
    if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return;
    const [moved] = visuals.splice(sourceIndex, 1);
    visuals.splice(Math.max(0, Math.min(visuals.length, targetIndex)), 0, moved);
    let visualIndex = 0;
    const clips = ordered.map((clip, order) => ({
      ...(isVisualClip(clip) ? visuals[visualIndex++] : clip),
      order,
    }));
    composition.value = createComposition(composition.value.assets, clips);
  };

  const updateSelectedAppearance = (patch: Partial<ClipAppearance>) => {
    const clip = selectedClip.value;
    if (!clip || !isVisualClip(clip)) return;
    composition.value = setAppearance(composition.value, clip.id, {
      ...createDefaultClipAppearance(clip.kind),
      ...clip.appearance,
      ...patch,
    });
  };
  const updateSelectedTransform = (transform: NormalizedTransform) => {
    if (selectedClipId.value) composition.value = setTransform(composition.value, selectedClipId.value, transform);
  };
  const updateSelectedCrop = (crop: NormalizedCrop) => {
    if (selectedClipId.value) composition.value = setCrop(composition.value, selectedClipId.value, crop);
  };
  const updateSelectedMirrored = (mirrored: boolean) => {
    if (selectedClipId.value) composition.value = setMirrored(composition.value, selectedClipId.value, mirrored);
  };
  const updateSelectedMirroredY = (mirroredY: boolean) => {
    if (selectedClipId.value) composition.value = setMirroredY(composition.value, selectedClipId.value, mirroredY);
  };
  const updateSelectedRate = (rate: number) => {
    if (selectedClipId.value) composition.value = setPlaybackRate(composition.value, selectedClipId.value, rate);
  };
  const updateSelectedVolume = (volume: number) => {
    if (selectedClipId.value) composition.value = setVolume(composition.value, selectedClipId.value, volume);
  };
  const updateSelectedEnabled = (enabled: boolean) => {
    if (selectedClipId.value) composition.value = setClipEnabled(composition.value, selectedClipId.value, enabled);
  };
  const toggleClip = (clipId: string) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip) return;
    selectedClipId.value = clipId;
    composition.value = setClipEnabled(composition.value, clipId, !clip.enabled);
  };
  const detachSelectedClip = () => {
    if (selectedClipId.value) composition.value = detachClip(composition.value, selectedClipId.value);
  };

  return {
    composition,
    selectedClipId,
    selectedClip,
    selectedClipInfo,
    selectedCaptionClip,
    selectedWebcamClip,
    isVideoEnabled,
    isWebcamEnabled,
    isSystemAudioEnabled,
    isMicAudioEnabled,
    synchronizeRecording,
    selectClip,
    addElement,
    addImportedAsset,
    addCaptionAtTime,
    updateCaption,
    previewClipEdge,
    trimClipEdge,
    previewMoveClip,
    moveClipTo,
    splitSelectedClip,
    deleteSelectedClip,
    reorderVisualClip,
    updateSelectedAppearance,
    updateSelectedTransform,
    updateSelectedCrop,
    updateSelectedMirrored,
    updateSelectedMirroredY,
    updateSelectedRate,
    updateSelectedVolume,
    updateSelectedEnabled,
    toggleClip,
    detachSelectedClip,
  };
}
