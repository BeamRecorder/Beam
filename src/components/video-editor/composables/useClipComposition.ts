import { computed, ref, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import { inspectMedia, mediaSourceDescriptor, type DroppedMediaInspection } from '~/media/shared';
import {
  emptyComposition,
  isAudioClip,
  isCompositingClip,
  isTextCaptionClip,
  isVisualClip,
  type AudioClip,
  type BlurClip,
  type CaptionClip,
  type Clip,
  type ClipComposition,
  type ColorClip,
  type MediaAsset,
  type VisualClip,
} from '~/media/shared/composition-types';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import type { EditorPreferenceDefaults } from './editor-default-types';
import { audioDefaultsFor, blurDefaultsFor, captionDefaultsFor, visualClipDefaultProps } from './editor-defaults';
import {
  addClip,
  clipTrimBounds,
  holdClipAtPlayhead,
  moveClip,
  reorderClip,
  reorderTextCaption,
  setClipEnabled,
  splitClip,
  trimClip,
} from '../composition/engine/clip-engine';
import { synchronizeRecordingClips } from '../composition/session-clips';
import { useTranslate } from '~/i18n/useTranslate';
import { useSelectedClips } from './useSelectedClips';

const endMs = (clip: Clip) => clip.timelineStartMs + clip.timelineDurationMs;
const DEFAULT_GENERATED_CLIP_DURATION_MS = 3_000;
export function useClipComposition(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  currentTimeSec: Ref<number>;
  activeTab: Ref<string>;
  editorDefaults: Ref<EditorPreferenceDefaults>;
}) {
  const { t } = useTranslate('TimelineToolbar');
  const { t: tCanvas } = useTranslate('CanvasPanel');
  const composition = ref<ClipComposition>(emptyComposition());
  const selection = useSelectedClips({ composition, activeTab: options.activeTab });
  const {
    selectedClipId,
    selectedClipIds,
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
  } = selection;

  const clipsBy = (predicate: (clip: Clip) => boolean) => computed(() => composition.value.clips.filter(predicate));
  const screenClips = clipsBy((clip) => clip.kind === 'screen');
  const webcamClips = clipsBy((clip) => clip.kind === 'webcam');
  const systemAudioClips = clipsBy((clip) => isAudioClip(clip) && clip.role === 'system');
  const microphoneClips = clipsBy((clip) => isAudioClip(clip) && clip.role === 'microphone');
  const hasSystemAudio = computed(() => systemAudioClips.value.length > 0);
  const hasMicAudio = computed(() => microphoneClips.value.length > 0);
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

  const synchronizeRecording = () => {
    composition.value = synchronizeRecordingClips(
      composition.value,
      options.editorData.value,
      options.editorDefaults.value,
    );
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
      const defaults = audioDefaultsFor(options.editorDefaults.value);
      const audio: AudioClip = {
        id: crypto.randomUUID(),
        kind: 'audio',
        name: asset.name,
        assetId: asset.id,
        role: 'imported',
        timelineStartMs: startMs,
        timelineDurationMs: duration / defaults.playbackRate,
        sourceInMs: 0,
        sourceDurationMs: duration,
        playbackRate: defaults.playbackRate,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: composition.value.clips.length,
        volume: defaults.volume,
      };
      composition.value = addClip(composition.value, audio, normalizedAsset);
      selectClip(audio.id);
      return audio.id;
    }

    const groupId =
      asset.kind === 'video' && inspection.hasAudio && inspection.canDecodeAudio ? crypto.randomUUID() : undefined;
    const topVisualOrder =
      Math.min(0, ...composition.value.clips.filter(isCompositingClip).map((clip) => clip.order)) - 1;
    const visualId = crypto.randomUUID();
    const defaults = visualClipDefaultProps(options.editorDefaults.value, asset.kind, duration);
    const visual: VisualClip = {
      id: visualId,
      trackId: visualId,
      kind: asset.kind,
      name: asset.name,
      assetId: asset.id,
      timelineStartMs: startMs,
      timelineDurationMs: duration / defaults.playbackRate,
      sourceInMs: 0,
      sourceDurationMs: duration,
      enabled: true,
      order: topVisualOrder,
      groupId,
      ...defaults,
    };
    let next = addClip(composition.value, visual, normalizedAsset);
    if (groupId) {
      const audioDefaults = audioDefaultsFor(options.editorDefaults.value);
      const audio: AudioClip = {
        id: crypto.randomUUID(),
        kind: 'audio',
        name: `${asset.name} audio`,
        assetId: asset.id,
        role: 'imported',
        timelineStartMs: startMs,
        timelineDurationMs: duration / defaults.playbackRate,
        sourceInMs: 0,
        sourceDurationMs: duration,
        playbackRate: defaults.playbackRate,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: next.clips.length,
        groupId,
        volume: audioDefaults.volume,
      };
      next = addClip(next, audio);
    }
    composition.value = next;
    selectClip(visual.id);
    return visual.id;
  };

  const addElement = async (
    kind: 'video' | 'image' | 'sound' | 'caption' | 'color' | 'blur',
    requestedStartMs?: number,
    requestedDurationMs?: number,
  ) => {
    const startMs = Math.max(0, Math.round(requestedStartMs ?? options.currentTimeSec.value * 1_000));
    if (kind === 'color') {
      const clipId = crypto.randomUUID();
      const durationMs = DEFAULT_GENERATED_CLIP_DURATION_MS;
      const clip: ColorClip = {
        id: clipId,
        trackId: clipId,
        kind: 'color',
        assetId: '',
        name: tCanvas('color'),
        timelineStartMs: startMs,
        timelineDurationMs: durationMs,
        sourceInMs: 0,
        sourceDurationMs: durationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: Math.min(0, ...composition.value.clips.filter(isCompositingClip).map((clip) => clip.order)) - 1,
        transform: { x: 0, y: 0, width: 1, height: 1 },
        fill: structuredClone(DEFAULT_COLOR_FILL),
      };
      composition.value = addClip(composition.value, clip);
      selectClip(clip.id);
      return;
    }
    if (kind === 'blur') {
      const defaults = blurDefaultsFor(options.editorDefaults.value);
      const clipId = crypto.randomUUID();
      const clip: BlurClip = {
        id: clipId,
        trackId: clipId,
        kind: 'blur',
        assetId: '',
        name: t('blur'),
        timelineStartMs: startMs,
        timelineDurationMs: DEFAULT_GENERATED_CLIP_DURATION_MS,
        sourceInMs: 0,
        sourceDurationMs: DEFAULT_GENERATED_CLIP_DURATION_MS,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: Math.min(0, ...composition.value.clips.filter(isCompositingClip).map((clip) => clip.order)) - 1,
        ...defaults,
      };
      composition.value = addClip(composition.value, clip);
      selectClip(clip.id);
      return;
    }
    if (kind === 'caption') {
      const defaults = captionDefaultsFor(options.editorDefaults.value);
      const roundedCaptionDurationMs = Math.round(requestedDurationMs ?? defaults.durationMs);
      if (!Number.isFinite(roundedCaptionDurationMs)) return;
      const captionDurationMs = Math.max(200, roundedCaptionDurationMs);
      const clip: CaptionClip = {
        id: crypto.randomUUID(),
        kind: 'caption',
        name: 'Caption',
        timelineStartMs: startMs,
        timelineDurationMs: captionDurationMs,
        sourceInMs: 0,
        sourceDurationMs: captionDurationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: Math.min(0, ...composition.value.clips.filter(isTextCaptionClip).map((entry) => entry.order)) - 1,
        caption: {
          type: 'text',
          sentences: [],
          style: { ...defaults.style, customText: 'Hello' },
        },
        ...(defaults.transform ? { transform: defaults.transform } : {}),
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

  const addCaptionAtTime = (request: number | { startMs: number; durationMs: number }) =>
    typeof request === 'number'
      ? addElement('caption', request)
      : addElement('caption', request.startMs, request.durationMs);

  const previewClipEdge = (clipId: string, edge: 'start' | 'end', timeMs: number) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip) return;
    const bounds = clipTrimBounds(composition.value, clipId, edge);
    const clamped = Math.max(bounds.minMs, Math.min(bounds.maxMs, Math.round(timeMs)));
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
  const holdClip = (clipId: string, timeMs: number) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip) return;
    composition.value = holdClipAtPlayhead(composition.value, clipId, timeMs);
    const hold = composition.value.clips.find(
      (entry) =>
        isVisualClip(entry) &&
        entry.trackId === clip.trackId &&
        entry.timelineStartMs === Math.round(timeMs) &&
        entry.freezeFrameSourceMs !== undefined,
    );
    if (hold) selectedClipId.value = hold.id;
  };
  const reorderVisualClip = (clipId: string, targetIndex: number) => {
    if (!Number.isInteger(targetIndex)) return;
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || !isCompositingClip(clip)) return;
    composition.value = reorderClip(composition.value, clipId, targetIndex);
  };
  const reorderCaptionClip = (clipId: string, targetIndex: number) => {
    if (!Number.isInteger(targetIndex)) return;
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip || !isTextCaptionClip(clip)) return;
    composition.value = reorderTextCaption(composition.value, clipId, targetIndex);
  };

  const toggleClip = (clipId: string) => {
    const clip = composition.value.clips.find((entry) => entry.id === clipId);
    if (!clip) return;
    selectedClipId.value = clipId;
    composition.value = setClipEnabled(composition.value, clipId, !clip.enabled);
  };
  return {
    composition,
    selectedClipId,
    selectedClipIds,
    selectedClip,
    selectedClipInfo,
    selectedCaptionClip,
    selectedWebcamClip,
    isVideoEnabled,
    isWebcamEnabled,
    isSystemAudioEnabled,
    isMicAudioEnabled,
    hasSystemAudio,
    hasMicAudio,
    synchronizeRecording,
    selectClip,
    selectClips,
    addElement,
    addImportedAsset,
    addCaptionAtTime,
    updateCaption,
    previewClipEdge,
    trimClipEdge,
    previewMoveClip,
    moveClipTo,
    splitSelectedClip,
    holdClip,
    deleteSelectedClip,
    reorderVisualClip,
    reorderCaptionClip,
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
    toggleClip,
    detachSelectedClip,
  };
}
