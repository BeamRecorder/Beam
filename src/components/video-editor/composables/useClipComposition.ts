import { useCompositionClipEditing } from './useCompositionClipEditing';
import { preservesLockedAssets } from '../composition/timeline-locks';
import { useLockedState } from './useLockedState';
import { computed, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { CaptureProject, ProjectEditorData } from '../../../api/types/capture-api';
import { inspectMedia, mediaSourceDescriptor, type DroppedMediaInspection } from '~/media/shared';
import {
  emptyComposition,
  isAudioClip,
  isCompositingClip,
  isTextCaptionClip,
  type AudioClip,
  type AudioRole,
  type BlurClip,
  type CaptionClip,
  type Clip,
  type ClipComposition,
  type ColorClip,
  type MediaAsset,
  type ShapeClip,
  type VisualClip,
} from '~/media/shared/composition-types';
import { DEFAULT_COLOR_LAYER_STYLE } from '~/media/shared/color-layer-style';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import { DEFAULT_SHAPE_LAYER_STYLE } from '~/media/shared/shape-layer-style';
import type { EditorPreferenceDefaults } from './editor-default-types';
import { audioDefaultsFor, blurDefaultsFor, captionDefaultsFor, visualClipDefaultProps } from './editor-defaults';
import { addClip, setClipEnabled } from '../composition/engine/clip-engine';
import { synchronizeRecordingClips } from '../composition/session-clips';
import { useTranslate } from '~/i18n/useTranslate';
import { useSelectedClips } from './useSelectedClips';
import { DEFAULT_VISUAL_ELEMENT_DURATION_MS } from '../composition/visual-element-defaults';
import type {
  AddVisualElementRequest,
  ImportedVisualPlacement,
  TimelineAddableVisualKind,
} from '../composition/visual-element-types';

export function useClipComposition(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  currentTimeSec: Ref<number>;
  activeTab: Ref<string>;
  editorDefaults: Ref<EditorPreferenceDefaults>;
}) {
  const { t } = useTranslate('TimelineToolbar');
  const { t: tCanvas } = useTranslate('CanvasPanel');
  const { state: composition, restore: restoreComposition } = useLockedState<ClipComposition>(
    emptyComposition(),
    (value) => value.clips,
    preservesLockedAssets,
  );
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
  const voiceoverClips = clipsBy((clip) => isAudioClip(clip) && clip.role === 'voiceover');
  const hasSystemAudio = computed(() => systemAudioClips.value.length > 0);
  const hasMicAudio = computed(() => microphoneClips.value.length > 0);
  const hasVoiceoverAudio = computed(() => voiceoverClips.value.length > 0);
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
    placement?: ImportedVisualPlacement,
    audioRole: AudioRole = 'imported',
  ) => {
    if (asset.kind !== inspection.kind) throw new Error('Le type du média importé est incohérent.');
    const startMs = Math.max(0, Math.round(requestedStartMs));
    const requestedImageDuration = asset.kind === 'image' ? placement?.durationMs : undefined;
    const duration = Math.round(requestedImageDuration ?? inspection.durationMs);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Le média importé ne contient aucune durée exploitable.');
    }
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
        role: audioRole,
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
    const targetTrackClip = placement?.trackId
      ? composition.value.clips.find(
          (clip) => isCompositingClip(clip) && clip.trackId === placement.trackId && clip.kind === asset.kind,
        )
      : null;
    if (placement?.trackId && (asset.kind !== 'image' || !targetTrackClip)) {
      throw new Error('La piste visuelle cible est incompatible avec le média importé.');
    }
    const visualId = crypto.randomUUID();
    const defaults = visualClipDefaultProps(options.editorDefaults.value, asset.kind, duration);
    const sourceDurationMs = requestedImageDuration ? requestedImageDuration * defaults.playbackRate : duration;
    const timelineDurationMs = requestedImageDuration ?? duration / defaults.playbackRate;
    const visual: VisualClip = {
      id: visualId,
      trackId: targetTrackClip?.trackId ?? visualId,
      kind: asset.kind,
      name: asset.name,
      assetId: asset.id,
      timelineStartMs: startMs,
      timelineDurationMs,
      sourceInMs: 0,
      sourceDurationMs,
      enabled: true,
      order: targetTrackClip?.order ?? topVisualOrder,
      groupId,
      ...defaults,
    };
    let next = addClip(composition.value, visual, { ...normalizedAsset, durationMs: sourceDurationMs });
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
    kind: 'video' | 'image' | 'sound' | 'caption' | 'color' | 'shape' | 'blur',
    requestedStartMs?: number,
    requestedDurationMs?: number,
    targetTrackId?: string,
  ) => {
    const startMs = Math.max(0, Math.round(requestedStartMs ?? options.currentTimeSec.value * 1_000));
    if (!Number.isFinite(startMs)) return;
    if (
      kind === 'image' &&
      requestedDurationMs !== undefined &&
      (!Number.isFinite(requestedDurationMs) || requestedDurationMs < 200)
    )
      return;
    const generatedKind: TimelineAddableVisualKind | null =
      kind === 'color' || kind === 'shape' || kind === 'blur' ? kind : null;
    const targetTrackClip =
      generatedKind && targetTrackId
        ? composition.value.clips.find(
            (clip) => isCompositingClip(clip) && clip.trackId === targetTrackId && clip.kind === generatedKind,
          )
        : null;
    if (generatedKind && targetTrackId && !targetTrackClip) return;
    const requestedGeneratedDurationMs = generatedKind
      ? Math.round(requestedDurationMs ?? DEFAULT_VISUAL_ELEMENT_DURATION_MS[generatedKind])
      : null;
    if (requestedGeneratedDurationMs !== null && !Number.isFinite(requestedGeneratedDurationMs)) return;
    const generatedDurationMs = Math.max(200, requestedGeneratedDurationMs ?? 0);
    const generatedTrackId = targetTrackClip?.trackId;
    const generatedOrder =
      targetTrackClip?.order ??
      Math.min(0, ...composition.value.clips.filter(isCompositingClip).map((clip) => clip.order)) - 1;
    if (kind === 'color') {
      const clipId = crypto.randomUUID();
      const clip: ColorClip = {
        id: clipId,
        trackId: generatedTrackId ?? clipId,
        kind: 'color',
        assetId: '',
        name: tCanvas('color'),
        timelineStartMs: startMs,
        timelineDurationMs: generatedDurationMs,
        sourceInMs: 0,
        sourceDurationMs: generatedDurationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: generatedOrder,
        transform: { x: 0.15, y: 0.2, width: 0.7, height: 0.6 },
        fill: structuredClone(DEFAULT_COLOR_FILL),
        ...DEFAULT_COLOR_LAYER_STYLE,
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
        trackId: generatedTrackId ?? clipId,
        kind: 'blur',
        assetId: '',
        name: t('blur'),
        timelineStartMs: startMs,
        timelineDurationMs: generatedDurationMs,
        sourceInMs: 0,
        sourceDurationMs: generatedDurationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: generatedOrder,
        ...defaults,
      };
      composition.value = addClip(composition.value, clip);
      selectClip(clip.id);
      return;
    }
    if (kind === 'shape') {
      const clipId = crypto.randomUUID();
      const clip: ShapeClip = {
        id: clipId,
        trackId: generatedTrackId ?? clipId,
        kind: 'shape',
        assetId: '',
        name: tCanvas('shapesAndArrows'),
        timelineStartMs: startMs,
        timelineDurationMs: generatedDurationMs,
        sourceInMs: 0,
        sourceDurationMs: generatedDurationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: generatedOrder,
        transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
        ...DEFAULT_SHAPE_LAYER_STYLE,
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
          durationMs: DEFAULT_VISUAL_ELEMENT_DURATION_MS.image,
          width: asset.width,
          height: asset.height,
          hasAudio: false,
          canDecodeAudio: false,
          audioCodec: null,
        },
        startMs,
        { durationMs: requestedDurationMs, trackId: targetTrackId },
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
  const addVisualElementAtTime = (request: AddVisualElementRequest) =>
    addElement(request.kind, request.startMs, request.durationMs, request.trackId);

  const {
    previewClipEdge,
    trimClipEdge,
    previewMoveClip,
    moveClipTo,
    splitSelectedClip,
    holdClip,
    reorderVisualClip,
    reorderCaptionClip,
    toggleClip,
  } = useCompositionClipEditing({ composition, selectedClip, selectedClipId, currentTimeSec: options.currentTimeSec });
  return {
    composition,
    restoreComposition,
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
    hasVoiceoverAudio,
    synchronizeRecording,
    selectClip,
    selectClips,
    addElement,
    addImportedAsset,
    addCaptionAtTime,
    addVisualElementAtTime,
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
