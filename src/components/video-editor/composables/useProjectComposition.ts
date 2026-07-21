import { ref, computed, type Ref } from "vue";
import { capture } from "../../../api/capture";
import type { CaptureProject, ProjectEditorData } from "../../../api/types/capture-api";
import {
  emptyComposition,
  type CompositionLayer,
  type CompositionMedia,
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
  const { project, editorData, durationMs, currentTimeSec, activeTab } = options;

  const composition = ref<ProjectComposition>(emptyComposition());
  const selectedCompositionLayerId = ref<string | null>(null);

  const selectedCompositionLayer = computed(
    () =>
      composition.value.layers.find(
        (layer) => layer.id === selectedCompositionLayerId.value,
      ) ?? null,
  );

  const selectedClipInfo = computed(() => {
    if (!selectedCompositionLayer.value) return null;
    const layer = selectedCompositionLayer.value;
    return {
      id: layer.id,
      kind: layer.kind,
      name: layer.name,
      timelineStartMs: layer.startMs,
      timelineDurationMs: layer.endMs - layer.startMs,
      playbackRate: 1.0,
      enabled: layer.enabled,
      isLinked: false,
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
    composition.value = await capture.saveProjectComposition(
      project.value.id,
      composition.value,
    );
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

  const handleUnlinkClips = async () => {
    if (selectedCompositionLayerId.value) {
      await saveComposition();
    }
  };

  const handleUnlinkTrack = async (trackKind: string) => {
    console.log(`Unlinked track: ${trackKind}`);
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
    handleUnlinkClips,
    handleUnlinkTrack,
  };
}
