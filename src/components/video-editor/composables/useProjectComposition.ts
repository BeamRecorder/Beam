import { ref, computed, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type {
  CaptureProject,
  ProjectEditorData,
} from "../../../api/types/capture-api";
import {
  emptyComposition,
  type ClipAppearance,
  type CompositionLayer,
  type CompositionMedia,
  type MediaCompositionLayer,
  type NormalizedCrop,
  type NormalizedTransform,
  type ProjectComposition,
} from "../composition/composition-types";
import {
  addCameraSegments,
  cameraLayers,
  splitCameraLayer,
  trimCameraLayer,
} from "../composition/webcam/camera-composition";

export function useProjectComposition(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  durationMs: Ref<number>;
  currentTimeSec: Ref<number>;
  activeTab: Ref<string>;
}) {
  const BASE_VIDEO_CLIP_ID = "base-video";
  const DEFAULT_APPEARANCE: ClipAppearance = {
    cornerRadius: "sm",
    shadowSize: "md",
    shadowColor: "#000000",
    shadowDirection: "bottom",
  };
  const { project, editorData, durationMs, currentTimeSec, activeTab } =
    options;

  const composition = ref<ProjectComposition>(emptyComposition());
  const selectedCompositionLayerId = ref<string | null>(null);

  const selectedCompositionLayer = computed(
    () =>
      composition.value.layers.find(
        (layer) => layer.id === selectedCompositionLayerId.value,
      ) ?? null,
  );

  const selectedClipInfo = computed(() => {
    const isLinked = composition.value.areClipsLinked ?? true;
    if (selectedCompositionLayerId.value === BASE_VIDEO_CLIP_ID) {
      return {
        id: BASE_VIDEO_CLIP_ID,
        kind: "video",
        name: "Screen recording",
        timelineStartMs: 0,
        timelineDurationMs: durationMs.value,
        playbackRate: composition.value.baseVideoPlaybackRate ?? 1.0,
        enabled: true,
        isLinked,
        isMirrored: composition.value.baseVideoIsMirrored ?? false,
        clipTransform: composition.value.baseVideoTransform ?? {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
        ...(composition.value.baseVideoAppearance ?? DEFAULT_APPEARANCE),
      };
    }
    if (!selectedCompositionLayer.value) return null;
    const layer = selectedCompositionLayer.value;
    const rawAppearance =
      layer.kind === "audio" || layer.kind === "caption"
        ? undefined
        : (layer.appearance ??
          (layer.kind === "video" ? layer.webcamAppearance : undefined) ??
          DEFAULT_APPEARANCE);
    const appearance = rawAppearance
      ? {
          ...rawAppearance,
          cornerRadius:
            typeof rawAppearance.cornerRadius === "number"
              ? rawAppearance.cornerRadius === 0
                ? "none"
                : rawAppearance.cornerRadius <= 10
                  ? "sm"
                  : rawAppearance.cornerRadius <= 18
                    ? "md"
                    : rawAppearance.cornerRadius <= 30
                      ? "lg"
                      : "full"
              : (rawAppearance.cornerRadius ?? "md"),
          shadowSize:
            typeof rawAppearance.shadowSize === "number"
              ? rawAppearance.shadowSize === 0
                ? "none"
                : rawAppearance.shadowSize <= 0.3
                  ? "sm"
                  : rawAppearance.shadowSize <= 0.5
                    ? "md"
                    : "lg"
              : (rawAppearance.shadowSize ?? "md"),
        }
      : undefined;
    return {
      id: layer.id,
      kind: layer.kind,
      name: layer.name,
      timelineStartMs: layer.startMs,
      timelineDurationMs: layer.endMs - layer.startMs,
      playbackRate:
        layer.kind !== "caption"
          ? ((layer as MediaCompositionLayer).playbackRate ?? 1.0)
          : 1.0,
      enabled: layer.enabled,
      isLinked,
      isMirrored:
        layer.kind === "audio" || layer.kind === "caption"
          ? undefined
          : (layer.isMirrored ??
            (layer.kind === "video" && layer.reactToZoom ? true : false)),
      ...(layer.kind !== "audio" && layer.kind !== "caption"
        ? {
            clipTransform: layer.transform ?? {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
          }
        : {}),
      ...(appearance ?? {}),
    };
  });

  const selectedCaptionLayer = computed(() =>
    selectedCompositionLayer.value?.kind === "caption"
      ? selectedCompositionLayer.value
      : null,
  );

  const selectedCameraLayer = computed(
    () =>
      cameraLayers(composition.value).find(
        (layer) => layer.id === selectedCompositionLayerId.value,
      ) ?? null,
  );

  const isCameraEnabled = computed(() =>
    cameraLayers(composition.value).some((layer) => layer.enabled),
  );

  const saveComposition = async () => {
    if (!project.value) return;
    const payload = JSON.parse(JSON.stringify(composition.value));
    await capture.saveProjectComposition(project.value.id, payload);
  };

  const loadComposition = async (projectId: string) => {
    const stored = await capture.getProjectComposition(projectId);
    const synchronized = addCameraSegments(stored, editorData.value);
    if (
      synchronized.media.length !== stored.media.length ||
      synchronized.layers.length !== stored.layers.length
    ) {
      composition.value = await capture.saveProjectComposition(
        projectId,
        synchronized,
      );
    } else composition.value = stored;
  };

  const toggleCamera = async () => {
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        cameraLayers(composition.value).some((camera) => camera.id === layer.id)
          ? { ...layer, enabled: !isCameraEnabled.value }
          : layer,
      ),
    };
    await saveComposition();
  };

  const splitSelectedCamera = async () => {
    if (!selectedCameraLayer.value) return;
    composition.value = splitCameraLayer(
      composition.value,
      selectedCameraLayer.value.id,
      Math.round(currentTimeSec.value * 1000),
    );
    await saveComposition();
  };

  const trimSelectedCamera = async (edge: "start" | "end") => {
    if (!selectedCameraLayer.value) return;
    composition.value = trimCameraLayer(
      composition.value,
      selectedCameraLayer.value.id,
      edge,
      Math.round(currentTimeSec.value * 1000),
    );
    await saveComposition();
  };

  const toggleSelectedCamera = async () => {
    if (!selectedCameraLayer.value) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        layer.id === selectedCameraLayer.value?.id
          ? { ...layer, enabled: !layer.enabled }
          : layer,
      ),
    };
    await saveComposition();
  };

  const mediaDuration = (asset: CompositionMedia) =>
    new Promise<number>((resolve) => {
      if (asset.kind === "image") return resolve(5000);
      const media = document.createElement(
        asset.kind === "audio" ? "audio" : "video",
      );
      media.preload = "metadata";
      media.onloadedmetadata = () => resolve(Math.round(media.duration * 1000));
      media.onerror = () => resolve(0);
      media.src = asset.src;
    });

  const addCompositionElement = async (
    kind: "video" | "image" | "sound" | "caption",
  ) => {
    if (!project.value) return;
    if (kind === "caption") {
      const startMs = Math.round(currentTimeSec.value * 1000);
      const layer: CompositionLayer = {
        id: crypto.randomUUID(),
        kind: "caption",
        name: "Caption",
        startMs,
        endMs: Math.min(durationMs.value, startMs + 5000),
        enabled: true,
        order: composition.value.layers.length,
        caption: {
          sentences: [],
          style: {
            color: "#ffffff",
            fontSize: 42,
            shadowColor: "#000000",
            shadowBlur: 4,
            placement: "bottom",
          },
        },
      };
      composition.value.layers.push(layer);
      await saveComposition();
      selectedCompositionLayerId.value = layer.id;
      activeTab.value = "caption";
      return;
    }
    const asset = await capture.pickProjectCompositionMedia(
      project.value.id,
      kind === "sound" ? "audio" : kind,
    );
    if (!asset) return;
    const nativeDuration = await mediaDuration(asset);
    const startMs = Math.round(currentTimeSec.value * 1000);
    const maxDuration = Math.max(0, durationMs.value - startMs);
    const clipDuration = Math.min(
      maxDuration,
      asset.kind === "image" ? 5000 : nativeDuration,
    );
    const layer: CompositionLayer = {
      id: crypto.randomUUID(),
      kind: asset.kind,
      name: asset.name,
      assetId: asset.id,
      startMs,
      endMs: startMs + clipDuration,
      enabled: true,
      order: composition.value.layers.length,
      ...(asset.kind === "audio"
        ? {}
        : { transform: { x: 0, y: 0, width: 1, height: 1 } }),
    };
    composition.value.layers.push(layer);
    await saveComposition();
    selectedCompositionLayerId.value = layer.id;
  };

  const addCaptionAtTime = async (startMs: number) => {
    if (!project.value) return;
    const layer: CompositionLayer = {
      id: crypto.randomUUID(),
      kind: "caption",
      name: "Caption",
      startMs,
      endMs: Math.min(durationMs.value, startMs + 2000),
      enabled: true,
      order: composition.value.layers.length,
      caption: {
        sentences: [],
        style: {
          color: "#ffffff",
          fontSize: 42,
          shadowColor: "#000000",
          shadowBlur: 4,
          placement: "bottom",
        },
      },
    };
    composition.value.layers.push(layer);
    await saveComposition();
    selectedCompositionLayerId.value = layer.id;
    activeTab.value = "caption";
  };

  const updateCaption = async (
    layer: Extract<CompositionLayer, { kind: "caption" }>,
  ) => {
    composition.value.layers = composition.value.layers.map((item) =>
      item.id === layer.id ? layer : item,
    );
    await saveComposition();
  };

  const previewLayerEdge = (
    layerId: string,
    edge: "start" | "end",
    timeMs: number,
  ) => {
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        if (edge === "start") {
          const clamped = Math.max(0, Math.min(layer.endMs - 200, Math.round(timeMs)));
          const delta = clamped - layer.startMs;
          const sourceOffsetMs =
            layer.kind === "video" || layer.kind === "audio"
              ? (layer.sourceOffsetMs ?? 0) + delta
              : undefined;
          return {
            ...layer,
            startMs: clamped,
            ...(sourceOffsetMs !== undefined ? { sourceOffsetMs } : {}),
          };
        } else {
          const clamped = Math.max(layer.startMs + 200, Math.round(timeMs));
          return {
            ...layer,
            endMs: clamped,
          };
        }
      }),
    };
  };

  const trimLayerEdge = async (
    layerId: string,
    edge: "start" | "end",
    timeMs: number,
  ) => {
    previewLayerEdge(layerId, edge, timeMs);
    await saveComposition();
  };

  const selectBaseVideo = () => {
    selectedCompositionLayerId.value = BASE_VIDEO_CLIP_ID;
    activeTab.value = "clip";
  };

  const updateSelectedClipAppearance = async (
    patch: Partial<ClipAppearance>,
  ) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    if (selectedId === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoAppearance: {
          ...DEFAULT_APPEARANCE,
          ...composition.value.baseVideoAppearance,
          ...patch,
        },
      };
    } else {
      composition.value = {
        ...composition.value,
        layers: composition.value.layers.map((layer) => {
          if (
            layer.id !== selectedId ||
            layer.kind === "audio" ||
            layer.kind === "caption"
          )
            return layer;
          const fallback =
            layer.kind === "video" ? layer.webcamAppearance : undefined;
          return {
            ...layer,
            appearance: {
              ...DEFAULT_APPEARANCE,
              ...fallback,
              ...layer.appearance,
              ...patch,
            },
          };
        }),
      };
    }
    await saveComposition();
  };

  const updateSelectedWebcamTransform = async (
    transform: NormalizedTransform,
  ) => {
    if (selectedCompositionLayerId.value === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoTransform: transform,
      };
      await saveComposition();
      return;
    }
    const layer = selectedCompositionLayer.value;
    const selectedId =
      layer && layer.kind !== "audio"
        ? layer.id
        : null;
    if (!selectedId) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        layer.id === selectedId &&
        layer.kind !== "audio"
          ? { ...layer, transform }
          : layer,
      ),
    };
    await saveComposition();
  };

  const previewSelectedWebcamTransform = (transform: NormalizedTransform) => {
    if (selectedCompositionLayerId.value === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoTransform: transform,
      };
      return;
    }
    const layer = selectedCompositionLayer.value;
    const selectedId =
      layer && layer.kind !== "audio"
        ? layer.id
        : null;
    if (!selectedId) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((entry) =>
        entry.id === selectedId &&
        entry.kind !== "audio"
          ? { ...entry, transform }
          : entry,
      ),
    };
  };

  const updateSelectedMediaCrop = async (crop: NormalizedCrop) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    if (selectedId === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoCrop: crop,
      };
    } else {
      composition.value = {
        ...composition.value,
        layers: composition.value.layers.map((layer) =>
          layer.id === selectedId &&
          layer.kind !== "audio" &&
          layer.kind !== "caption"
            ? { ...layer, crop }
            : layer,
        ),
      };
    }
    await saveComposition();
  };

  const updateSelectedClipIsMirrored = async (isMirrored: boolean) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    if (selectedId === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoIsMirrored: isMirrored,
      };
    } else {
      composition.value = {
        ...composition.value,
        layers: composition.value.layers.map((layer) => {
          if (
            layer.id !== selectedId ||
            layer.kind === "audio" ||
            layer.kind === "caption"
          )
            return layer;
          return {
            ...layer,
            isMirrored,
          };
        }),
      };
    }
    await saveComposition();
  };

  const updateSelectedClipPlaybackRate = async (rate: number) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    const isLinked = composition.value.areClipsLinked ?? true;

    if (isLinked) {
      // Apply speedup to base video AND all media layers (webcam, video, audio)
      composition.value = {
        ...composition.value,
        baseVideoPlaybackRate: rate,
        layers: composition.value.layers.map((layer) =>
          layer.kind === "caption" ? layer : { ...layer, playbackRate: rate },
        ),
      };
    } else if (selectedId === BASE_VIDEO_CLIP_ID) {
      composition.value = {
        ...composition.value,
        baseVideoPlaybackRate: rate,
      };
    } else {
      composition.value = {
        ...composition.value,
        layers: composition.value.layers.map((layer) =>
          layer.id === selectedId && layer.kind !== "caption"
            ? { ...layer, playbackRate: rate }
            : layer,
        ),
      };
    }
    await saveComposition();
  };

  const handleUnlinkClips = async () => {
    composition.value = {
      ...composition.value,
      areClipsLinked: !(composition.value.areClipsLinked ?? true),
    };
    await saveComposition();
  };

  const handleUnlinkTrack = async (trackKind: string) => {
    console.log(`Unlinked track: ${trackKind}`);
    await saveComposition();
  };

  const deleteSelectedCompositionLayer = async () => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId || selectedId === BASE_VIDEO_CLIP_ID) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.filter((l) => l.id !== selectedId),
    };
    selectedCompositionLayerId.value = null;
    await saveComposition();
  };

  return {
    composition,
    selectedCompositionLayerId,
    selectedCompositionLayer,
    selectedClipInfo,
    selectedCaptionLayer,
    selectedCameraLayer,
    isCameraEnabled,
    saveComposition,
    loadComposition,
    toggleCamera,
    splitSelectedCamera,
    trimSelectedCamera,
    toggleSelectedCamera,
    addCompositionElement,
    addCaptionAtTime,
    updateCaption,
    deleteSelectedCompositionLayer,
    previewLayerEdge,
    trimLayerEdge,
    selectBaseVideo,
    updateSelectedClipAppearance,
    updateSelectedClipIsMirrored,
    updateSelectedClipPlaybackRate,
    updateSelectedWebcamTransform,
    previewSelectedWebcamTransform,
    updateSelectedMediaCrop,
    handleUnlinkClips,
    handleUnlinkTrack,
  };
}
