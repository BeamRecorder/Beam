import { ref, computed, onUnmounted, type Ref } from "vue";
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
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
import { normalizedVisualTrackOrder } from "../composition/visual-stack";
import { splitCompositionLayersAt } from "../composition/split-composition-layers";
import { deleteCompositionLayer } from "../composition/delete-composition-layer";
import { baseVideoSegmentAtTime, baseVideoSegmentFromId, deleteBaseVideoSegment, sessionSegmentAtTimeline, sessionSegments, sessionTimelineDuration, trimSessionSegment } from "../composition/base-video-ranges";
import {
  detachSidecarLink,
  resolveSidecarLinks,
  type SidecarLinkDescriptor,
} from "../composition/sidecar-links";

export function useProjectComposition(options: {
  project: Ref<CaptureProject | null | undefined>;
  editorData: Ref<ProjectEditorData | null | undefined>;
  durationMs: Ref<number>;
  currentTimeSec: Ref<number>;
  activeTab: Ref<string>;
}) {
  const BASE_VIDEO_CLIP_ID = "base-video";
  const isBaseVideoSelection = (id: string | null) =>
    id === BASE_VIDEO_CLIP_ID || id?.startsWith(`${BASE_VIDEO_CLIP_ID}:`) === true;
  const DEFAULT_APPEARANCE: ClipAppearance = {
    cornerRadius: "sm",
    shadowSize: "md",
    shadowColor: "#000000",
    shadowDirection: "bottom",
    borderEnabled: false,
    borderColor: "#000000",
    borderWidth: 1,
    frame: "none",
    frameTitle: "",
    frameColor: "#c0c0c0",
    frameShowMenu: true,
    frameShowScrollbars: true,
  };
  const { project, editorData, durationMs, currentTimeSec, activeTab } =
    options;

  const composition = ref<ProjectComposition>(emptyComposition());
  // `durationMs` is the compacted timeline duration after a ripple edit. Segment
  // operations must instead use the original source extent, otherwise a second
  // trim clamps every later segment to the shortened timeline.
  const sessionSourceDurationMs = () => Math.max(
    durationMs.value,
    0,
    Math.round((editorData.value?.manifest.durationNs ?? 0) / 1_000_000),
    ...(composition.value.sessionSegments?.map((segment) => segment.sourceEndMs) ?? []),
  );
  const selectedCompositionLayerId = ref<string | null>(null);
  const selectedBaseSegment = computed(() => {
    const id = selectedCompositionLayerId.value ? baseVideoSegmentFromId(selectedCompositionLayerId.value) : null;
    return id ? sessionSegments(composition.value, sessionSourceDurationMs()).find((segment) => segment.id === id) ?? null : null;
  });

  const deleteSessionAndPositionPlayhead = (segmentId: string) => {
    const sourceDuration = sessionSourceDurationMs();
    const deletedTimelineMs = Math.round(currentTimeSec.value * 1000);
    composition.value = deleteBaseVideoSegment(composition.value, segmentId, sourceDuration);
    const next = sessionSegmentAtTimeline(composition.value, deletedTimelineMs, sourceDuration);
    currentTimeSec.value = (next?.timelineStartMs ?? sessionTimelineDuration(composition.value, sourceDuration)) / 1000;
  };

  const selectedCompositionLayer = computed(
    () =>
      composition.value.layers.find(
        (layer) => layer.id === selectedCompositionLayerId.value,
      ) ?? null,
  );

  const selectedClipInfo = computed(() => {
    if (isBaseVideoSelection(selectedCompositionLayerId.value)) {
      return {
        id: BASE_VIDEO_CLIP_ID,
        kind: "video",
        name: "Screen recording",
        timelineStartMs: 0,
        timelineDurationMs: durationMs.value,
        playbackRate: selectedBaseSegment.value?.playbackRate ?? composition.value.baseVideoPlaybackRate ?? 1.0,
        enabled: true,
        sidecarLinks: resolveSidecarLinks(composition.value, editorData.value, selectedCompositionLayerId.value),
        isMirrored: composition.value.baseVideoIsMirrored ?? false,
        clipTransform: composition.value.baseVideoTransform ?? {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
        ...(selectedBaseSegment.value?.appearance ?? composition.value.baseVideoAppearance ?? DEFAULT_APPEARANCE),
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
      volume: layer.kind === "audio" ? (layer.volume ?? 100) : undefined,
      enabled: layer.enabled,
      sidecarLinks: resolveSidecarLinks(composition.value, editorData.value, selectedCompositionLayerId.value),
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
    const saved = await capture.saveProjectComposition(project.value.id, payload);
    composition.value = saved;
  };

  let playbackRateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let playbackRateRevision = 0;
  const schedulePlaybackRateSave = () => {
    playbackRateRevision += 1;
    const revision = playbackRateRevision;
    if (playbackRateSaveTimer) clearTimeout(playbackRateSaveTimer);
    playbackRateSaveTimer = setTimeout(async () => {
      playbackRateSaveTimer = null;
      if (!project.value) return;
      try {
        const saved = await capture.saveProjectComposition(
          project.value.id,
          JSON.parse(JSON.stringify(composition.value)),
        );
        // A response from an earlier slider position must never overwrite a newer preview.
        if (revision === playbackRateRevision) composition.value = saved;
      } catch (error) {
        console.error("Failed to save clip playback rate:", error);
      }
    }, 180);
  };

  let appearanceSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let appearanceSaveChain = Promise.resolve();
  const saveAppearance = () => {
    appearanceSaveTimer = null;
    if (!project.value) return;
    const projectId = project.value.id;
    const payload = JSON.parse(JSON.stringify(composition.value));
    appearanceSaveChain = appearanceSaveChain
      .catch(() => undefined)
      .then(() => capture.saveProjectComposition(projectId, payload))
      .then(() => undefined)
      .catch((error) => console.error("Failed to save clip appearance:", error));
  };
  const scheduleAppearanceSave = () => {
    if (appearanceSaveTimer) clearTimeout(appearanceSaveTimer);
    appearanceSaveTimer = setTimeout(saveAppearance, 200);
  };
  onUnmounted(() => {
    if (playbackRateSaveTimer) {
      clearTimeout(playbackRateSaveTimer);
      playbackRateSaveTimer = null;
      if (project.value) void capture.saveProjectComposition(project.value.id, JSON.parse(JSON.stringify(composition.value)));
    }
    if (!appearanceSaveTimer) return;
    clearTimeout(appearanceSaveTimer);
    saveAppearance();
  });

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

  const splitCompositionAtPlayhead = async () => {
    const next = splitCompositionLayersAt(
      composition.value,
      Math.round(currentTimeSec.value * 1000),
      sessionSourceDurationMs(),
      undefined,
      Math.round(currentTimeSec.value * 1000),
    );
    if (next === composition.value) return;
    composition.value = next;
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

  const videoHasAudio = async (asset: CompositionMedia) => {
    if (asset.kind !== "video") return false;
    try {
      const response = await fetch(asset.src);
      if (!response.ok) return false;
      const input = new Input({ source: new BlobSource(await response.blob()), formats: ALL_FORMATS });
      return (await input.getAudioTracks()).length > 0;
    } catch {
      return false;
    }
  };

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
      activeTab.value = "clip";
      return;
    }
    const asset = await capture.pickProjectCompositionMedia(
      project.value.id,
      kind === "sound" ? "audio" : kind,
    );
    if (!asset) return;
    const nativeDuration = await mediaDuration(asset);
    if (asset.kind !== "image" && nativeDuration <= 0) {
      throw new Error("Impossible de lire la durée du média importé.");
    }
    const startMs = Math.round(currentTimeSec.value * 1000);
    const maxDuration = Math.max(0, durationMs.value - startMs);
    const clipDuration = Math.min(
      maxDuration,
      asset.kind === "image" ? 5000 : nativeDuration,
    );
    const groupId = asset.kind === "video" && await videoHasAudio(asset)
      ? crypto.randomUUID()
      : undefined;
    const layer: CompositionLayer = {
      id: crypto.randomUUID(),
      kind: asset.kind,
      name: asset.name,
      assetId: asset.id,
      startMs,
      endMs: startMs + clipDuration,
      enabled: true,
      order: composition.value.layers.length,
      ...(groupId ? { groupId } : {}),
      ...(asset.kind === "audio"
        ? { volume: 100 }
        : { transform: { x: 0, y: 0, width: 1, height: 1 } }),
    };
    const linkedAudio: CompositionLayer | null = groupId
      ? {
          id: crypto.randomUUID(), kind: "audio", name: `${asset.name} audio`, assetId: asset.id,
          startMs, endMs: startMs + clipDuration, enabled: true, volume: 100,
          order: composition.value.layers.length + 1, groupId,
        }
      : null;
    // The picker persists the asset in Electron. Keep the exact returned asset
    // in renderer state before saving a layer that references it.
    composition.value = {
      ...composition.value,
      media: [...composition.value.media.filter((item) => item.id !== asset.id), asset],
      layers: [...composition.value.layers, layer, ...(linkedAudio ? [linkedAudio] : [])],
      visualTrackOrder:
        asset.kind === "video" || asset.kind === "image"
          ? [layer.id, ...normalizedVisualTrackOrder(composition.value)]
          : composition.value.visualTrackOrder,
    };
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
    activeTab.value = "clip";
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
        const source = composition.value.layers.find((item) => item.id === layerId);
        if (!source || (layer.id !== layerId && (!source.groupId || layer.groupId !== source.groupId))) return layer;
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
    const sessionSegmentId = baseVideoSegmentFromId(layerId);
    if (sessionSegmentId) {
      composition.value = trimSessionSegment(composition.value, sessionSegmentId, edge, timeMs, sessionSourceDurationMs());
      await saveComposition();
      return;
    }
    previewLayerEdge(layerId, edge, timeMs);
    await saveComposition();
  };

  const selectBaseVideo = (segmentId = BASE_VIDEO_CLIP_ID) => {
    const resolvedId = segmentId === BASE_VIDEO_CLIP_ID
      ? sessionSegmentAtTimeline(composition.value, Math.round(currentTimeSec.value * 1000), sessionSourceDurationMs())?.id
      : baseVideoSegmentFromId(segmentId);
    selectedCompositionLayerId.value = resolvedId ? `base-video:${resolvedId}` : BASE_VIDEO_CLIP_ID;
    activeTab.value = "clip";
  };

  const updateSelectedClipAppearance = (
    patch: Partial<ClipAppearance>,
  ) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    if (isBaseVideoSelection(selectedId)) {
      const segmentId = baseVideoSegmentFromId(selectedId);
      if (segmentId) {
        composition.value = {
          ...composition.value,
          sessionSegments: sessionSegments(composition.value, sessionSourceDurationMs()).map(({ timelineStartMs: _start, timelineEndMs: _end, ...segment }) => segment.id === segmentId
            ? { ...segment, appearance: { ...DEFAULT_APPEARANCE, ...segment.appearance, ...patch } }
            : segment),
        };
      } else {
      composition.value = {
        ...composition.value,
        baseVideoAppearance: {
          ...DEFAULT_APPEARANCE,
          ...composition.value.baseVideoAppearance,
          ...patch,
        },
      };
      }
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
    const continuousKeys: Array<keyof ClipAppearance> = [
      "borderColor",
      "borderWidth",
      "frameColor",
      "frameTitle",
    ];
    const changedKeys = Object.keys(patch) as Array<keyof ClipAppearance>;
    if (changedKeys.every((key) => continuousKeys.includes(key))) {
      scheduleAppearanceSave();
    } else {
      if (appearanceSaveTimer) clearTimeout(appearanceSaveTimer);
      saveAppearance();
    }
  };

  const updateSelectedWebcamTransform = async (
    transform: NormalizedTransform,
  ) => {
    if (isBaseVideoSelection(selectedCompositionLayerId.value)) {
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
    if (isBaseVideoSelection(selectedCompositionLayerId.value)) {
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
    if (isBaseVideoSelection(selectedId)) {
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
    if (isBaseVideoSelection(selectedId)) {
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

  const updateSelectedClipPlaybackRate = (rate: number) => {
    if (!Number.isFinite(rate) || rate < .25 || rate > 4) return;
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    if (isBaseVideoSelection(selectedId)) {
      const segmentId = baseVideoSegmentFromId(selectedId);
      if (segmentId) {
        composition.value = {
          ...composition.value,
          sessionSegments: sessionSegments(composition.value, sessionSourceDurationMs()).map(({ timelineStartMs: _start, timelineEndMs: _end, ...segment }) => segment.id === segmentId ? { ...segment, playbackRate: rate } : segment),
        };
        schedulePlaybackRateSave();
        return;
      }
      composition.value = {
        ...composition.value,
        baseVideoPlaybackRate: rate,
      };
    } else {
      const selected = composition.value.layers.find((layer) => layer.id === selectedId);
      composition.value = {
        ...composition.value,
        layers: composition.value.layers.map((layer) =>
          layer.kind !== "caption" && (layer.id === selectedId || Boolean(selected?.groupId && layer.groupId === selected.groupId))
            ? { ...layer, playbackRate: rate }
            : layer,
        ),
      };
    }
    schedulePlaybackRateSave();
  };

  const updateSelectedAudioVolume = async (volume: number) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        layer.id === selectedId && layer.kind === "audio"
          ? { ...layer, volume: Math.max(0, Math.min(200, volume)) }
          : layer,
      ),
    };
    await saveComposition();
  };

  const updateSelectedClipEnabled = async (enabled: boolean) => {
    const selectedId = selectedCompositionLayerId.value;
    if (!selectedId) return;
    const baseSegmentId = baseVideoSegmentFromId(selectedId);
    if (baseSegmentId) {
      deleteSessionAndPositionPlayhead(baseSegmentId);
      selectedCompositionLayerId.value = null;
      await saveComposition();
      return;
    }
    if (selectedId === "system-audio" || selectedId === "microphone") {
      const range = baseVideoSegmentAtTime(composition.value, Math.round(currentTimeSec.value * 1000), sessionSourceDurationMs());
      if (!range) return;
      deleteSessionAndPositionPlayhead(range.id);
      selectedCompositionLayerId.value = null;
      await saveComposition();
      return;
    }
    if (isBaseVideoSelection(selectedId)) return;
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        layer.id === selectedId ? { ...layer, enabled } : layer,
      ),
    };
    await saveComposition();
  };

  const toggleCompositionLayer = async (layerId: string) => {
    const layer = composition.value.layers.find((item) => item.id === layerId);
    if (!layer) return;
    selectedCompositionLayerId.value = layerId;
    await updateSelectedClipEnabled(!layer.enabled);
  };

  const detachSelectedSidecar = async (sidecar: SidecarLinkDescriptor) => {
    const next = detachSidecarLink(
      composition.value,
      selectedCompositionLayerId.value,
      sidecar,
    );
    if (next === composition.value) return;
    composition.value = next;
    await saveComposition();
  };

  const deleteSelectedCompositionLayer = async () => {
    const selectedId = selectedCompositionLayerId.value;
    console.info("[timeline:delete] requested", {
      selectedId,
      currentTimeMs: Math.round(currentTimeSec.value * 1000),
      layerCount: composition.value.layers.length,
      sessionSegments: composition.value.sessionSegments ?? [],
    });
    if (!selectedId) {
      console.warn("[timeline:delete] skipped: no selected element");
      return;
    }
    const baseSegmentId = baseVideoSegmentFromId(selectedId);
    if (baseSegmentId) {
      console.info("[timeline:delete] deleting base-video segment", baseSegmentId);
      deleteSessionAndPositionPlayhead(baseSegmentId);
      selectedCompositionLayerId.value = null;
      await saveComposition();
      console.info("[timeline:delete] saved base-video segment", {
        sessionSegments: composition.value.sessionSegments ?? [],
      });
      return;
    }
    if (selectedId === "system-audio" || selectedId === "microphone") {
      const range = baseVideoSegmentAtTime(
        composition.value,
        Math.round(currentTimeSec.value * 1000),
        sessionSourceDurationMs(),
      );
      if (!range) {
        console.warn("[timeline:delete] skipped: unable to resolve session segment", { selectedId, durationMs: durationMs.value });
        return;
      }
      console.info("[timeline:delete] deleting synchronized session segment", { selectedId, range });
      deleteSessionAndPositionPlayhead(range.id);
      selectedCompositionLayerId.value = null;
      await saveComposition();
      console.info("[timeline:delete] saved synchronized session segment", {
        sessionSegments: composition.value.sessionSegments ?? [],
      });
      return;
    }
    if (isBaseVideoSelection(selectedId)) {
      console.warn("[timeline:delete] skipped: base-video selections are not composition layers", { selectedId });
      return;
    }
    const selectedLayer = composition.value.layers.find((layer) => layer.id === selectedId);
    if (!selectedLayer) {
      console.warn("[timeline:delete] skipped: selected layer is absent", { selectedId });
      return;
    }
    console.info("[timeline:delete] deleting composition layer", {
      id: selectedLayer.id,
      kind: selectedLayer.kind,
      groupId: selectedLayer.groupId ?? null,
    });
    composition.value = deleteCompositionLayer(composition.value, selectedId);
    selectedCompositionLayerId.value = null;
    await saveComposition();
    console.info("[timeline:delete] saved", { remainingLayerCount: composition.value.layers.length });
  };

  const previewMoveLayer = (id: string, startMs: number, endMs: number) => {
    const source = composition.value.layers.find((layer) => layer.id === id);
    composition.value = {
      ...composition.value,
      layers: composition.value.layers.map((layer) =>
        layer.id === id || (source?.groupId && layer.groupId === source.groupId)
          ? { ...layer, startMs, endMs }
          : layer,
      ),
    };
  };

  const reorderVisualTrack = async (id: string, targetIndex: number) => {
    previewVisualTrack(id, targetIndex);
    if (visualOrderSaveTimer) {
      window.clearTimeout(visualOrderSaveTimer);
      visualOrderSaveTimer = null;
    }
    await saveComposition();
  };

  let visualOrderSaveTimer: number | null = null;
  const applyVisualTrackOrder = (id: string, targetIndex: number) => {
    const tracks = normalizedVisualTrackOrder(composition.value);
    const currentIndex = tracks.indexOf(id);
    if (currentIndex < 0 || currentIndex === targetIndex) return false;
    const next = [...tracks];
    next.splice(currentIndex, 1);
    next.splice(Math.max(0, Math.min(next.length, targetIndex)), 0, id);
    composition.value = { ...composition.value, visualTrackOrder: next };
    return true;
  };

  const previewVisualTrack = (id: string, targetIndex: number) => {
    if (!applyVisualTrackOrder(id, targetIndex) || !project.value) return;
    if (visualOrderSaveTimer) window.clearTimeout(visualOrderSaveTimer);
    visualOrderSaveTimer = window.setTimeout(() => {
      visualOrderSaveTimer = null;
      void saveComposition();
    }, 350);
  };

  const moveLayer = async (id: string, startMs: number, endMs: number) => {
    previewMoveLayer(id, startMs, endMs);
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
    splitCompositionAtPlayhead,
    trimSelectedCamera,
    toggleSelectedCamera,
    addCompositionElement,
    addCaptionAtTime,
    updateCaption,
    deleteSelectedCompositionLayer,
    previewLayerEdge,
    trimLayerEdge,
    previewMoveLayer,
    moveLayer,
    previewVisualTrack,
    reorderVisualTrack,
    selectBaseVideo,
    updateSelectedClipAppearance,
    updateSelectedClipIsMirrored,
    updateSelectedClipPlaybackRate,
    updateSelectedAudioVolume,
    updateSelectedClipEnabled,
    toggleCompositionLayer,
    updateSelectedWebcamTransform,
    previewSelectedWebcamTransform,
    updateSelectedMediaCrop,
    detachSelectedSidecar,
  };
}
