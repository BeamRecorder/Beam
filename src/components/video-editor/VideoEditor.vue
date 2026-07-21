<script setup lang="ts">
import { computed, ref, onMounted, toRef, watch } from "vue";
import SidebarPanel from "./sidebar/SidebarPanel.vue";
import PropertiesPanel from "./properties/PropertiesPanel.vue";
import EditorCanvas from "./canvas/EditorCanvas.vue";
import EditorTimeline from "./timeline/EditorTimeline.vue";
import { createCompositionSnapshot } from "../export/composition/snapshot";
import Topbar from "./Topbar.vue";

import { useVideoPlayer } from "./composables/useVideoPlayer";
import { useEditorAudio } from "./composables/useEditorAudio";
import { useCursorReplacer } from "./composables/useCursorReplacer";

const props = withDefaults(
  defineProps<{
    videoSrc?: string | null;
    project?: CaptureProject | null;
    editorData?: ProjectEditorData | null;
  }>(),
  {
    videoSrc: null,
    project: null,
    editorData: null,
  },
);

import { capture } from "../../api/capture";
import type {
  CaptureProject,
  ProjectEditorData,
} from "../../api/types/capture-api";
import type { ZoomElement } from "./zoom/zoom-types";
import {
  emptyComposition,
  type CompositionLayer,
  type CompositionMedia,
  type ProjectComposition,
} from "./composition/composition-types";
import {
  addCameraSegments,
  cameraLayers,
  splitCameraLayer,
  trimCameraLayer,
} from "./composition/webcam/camera-composition.ts";
import {
  buildAutomaticZoomElements,
  ZOOM_ALGORITHM_VERSION,
} from "./zoom/zoom-suggestions";

const emit = defineEmits<{
  (event: "back-to-hud"): void;
  (event: "open-project", project: CaptureProject): void;
}>();

// Load composables
const {
  isPlaying,
  currentTime,
  duration,
  volume,
  videoSrc: playerVideoSrc,
  selectedBackground,
  selectedBackgroundMedia,
  backgroundGroups,
  addBackground,
  isVideoEnabled,
  isSystemAudioEnabled,
  isMicAudioEnabled,
} = useVideoPlayer();

useEditorAudio({
  editorData: toRef(props, "editorData"),
  currentTime,
  isPlaying,
  volume,
  systemAudioEnabled: isSystemAudioEnabled,
  microphoneEnabled: isMicAudioEnabled,
});

const {
  selectedCursor,
  cursorSize,
  cursorColor,
  enableShadow,
  enableRipple,
  shadowBlur,
  shadowColor,
  rippleColor,
  rippleSize,
} = useCursorReplacer();

const activeTab = ref("cursor");
const composition = ref<ProjectComposition>(emptyComposition());
const selectedCompositionLayerId = ref<string | null>(null);
const selectedCompositionLayer = computed(
  () =>
    composition.value.layers.find(
      (layer) => layer.id === selectedCompositionLayerId.value,
    ) ?? null,
);
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
const zoomElements = ref<ZoomElement[]>([]);
const generatedSessions = ref<ProjectEditorData["zoom"]["generatedSessions"]>(
  [],
);
const selectedZoomId = ref<string | null>(null);
const selectedZoom = computed(
  () =>
    zoomElements.value.find((element) => element.id === selectedZoomId.value) ??
    null,
);
const canGenerateZooms = computed(() =>
  Boolean(
    props.project &&
    props.editorData?.cursor.available &&
    props.editorData.sessionId,
  ),
);
const hasAutomaticZooms = computed(() =>
  zoomElements.value.some((element) => element.mode === "auto"),
);
const sourceSize = ref({ width: 1920, height: 1080 });
const sourceFps = computed(() => {
  const screen = props.editorData?.tracks.find(
    (track) => track.kind === "screen",
  );
  const value = screen?.format.frameRate ?? screen?.format.fps;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 30;
});

const exportRequest = computed(() => {
  if (!props.project || !playerVideoSrc.value) return null;
  try {
    const snapshot = createCompositionSnapshot({
      videoSrc: playerVideoSrc.value,
      duration: duration.value,
      width: sourceSize.value.width,
      height: sourceSize.value.height,
      fps: sourceFps.value,
      videoEnabled: isVideoEnabled.value,
      background: selectedBackgroundMedia.value,
      editorData: props.editorData,
      zooms: zoomElements.value,
      composition: composition.value,
      cursorSettings: {
        selectedCursor: selectedCursor.value,
        size: cursorSize.value,
        color: cursorColor.value,
        shadow: {
          enabled: enableShadow.value,
          blur: shadowBlur.value,
          color: shadowColor.value,
        },
        ripple: {
          enabled: enableRipple.value,
          color: rippleColor.value,
          size: rippleSize.value,
        },
      },
      systemAudioEnabled: isSystemAudioEnabled.value,
      micAudioEnabled: isMicAudioEnabled.value,
    });
    return {
      projectName: props.project.name,
      snapshot,
    };
  } catch (e) {
    return null;
  }
});

watch(
  () => props.editorData,
  (data) => {
    zoomElements.value = data?.zoom.elements ?? [];
    generatedSessions.value = data?.zoom.generatedSessions ?? [];
    selectedZoomId.value = null;
  },
  { immediate: true },
);

const saveZoomState = async () => {
  if (!props.project) return;
  const zoom = await capture.saveProjectZoomState(props.project.id, {
    elements: JSON.parse(JSON.stringify(zoomElements.value)),
    generatedSessions: JSON.parse(JSON.stringify(generatedSessions.value)),
  });
  zoomElements.value = zoom.elements;
  generatedSessions.value = zoom.generatedSessions;
};

const saveComposition = async () => {
  if (!props.project) return;
  composition.value = await capture.saveProjectComposition(
    props.project.id,
    composition.value,
  );
};

const loadComposition = async (projectId: string) => {
  const stored = await capture.getProjectComposition(projectId);
  const synchronized = addCameraSegments(stored, props.editorData);
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
    Math.round(currentTime.value * 1000),
  );
  await saveComposition();
};

const trimSelectedCamera = async (edge: "start" | "end") => {
  if (!selectedCameraLayer.value) return;
  composition.value = trimCameraLayer(
    composition.value,
    selectedCameraLayer.value.id,
    edge,
    Math.round(currentTime.value * 1000),
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
  if (!props.project) return;
  if (kind === "caption") {
    const startMs = Math.round(currentTime.value * 1000);
    const layer: CompositionLayer = {
      id: crypto.randomUUID(),
      kind: "caption",
      name: "Caption",
      startMs,
      endMs: Math.min(Math.round(duration.value * 1000), startMs + 5000),
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
    props.project.id,
    kind === "sound" ? "audio" : kind,
  );
  if (!asset) return;
  const nativeDuration = await mediaDuration(asset);
  const startMs = Math.round(currentTime.value * 1000);
  const maxDuration = Math.max(0, Math.round(duration.value * 1000) - startMs);
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

const updateCaption = async (
  layer: Extract<CompositionLayer, { kind: "caption" }>,
) => {
  composition.value.layers = composition.value.layers.map((item) =>
    item.id === layer.id ? layer : item,
  );
  await saveComposition();
};

const generateZooms = async (automatic = false) => {
  const data = props.editorData;
  if (!data || !props.project || !data.cursor.available) return;
  const durationMs = data.manifest.durationNs / 1_000_000;
  const generated = buildAutomaticZoomElements({
    telemetry: data.cursor.telemetry,
    sessionId: data.sessionId,
    durationMs,
    reserved: zoomElements.value.filter((element) => element.mode === "manual"),
  });
  zoomElements.value = [
    ...zoomElements.value.filter(
      (element) =>
        element.sessionId !== data.sessionId || element.mode !== "auto",
    ),
    ...generated,
  ];
  generatedSessions.value = [
    ...generatedSessions.value.filter(
      (record) => record.sessionId !== data.sessionId,
    ),
    {
      sessionId: data.sessionId,
      algorithmVersion: ZOOM_ALGORITHM_VERSION,
      generatedAt: new Date().toISOString(),
    },
  ];
  selectedZoomId.value = generated[0]?.id ?? null;
  await saveZoomState();
  if (automatic) activeTab.value = "zoom";
};

watch(
  () => props.editorData?.sessionId,
  (sessionId) => {
    if (
      !sessionId ||
      !props.editorData ||
      generatedSessions.value.some(
        (record) =>
          record.sessionId === sessionId &&
          record.algorithmVersion >= ZOOM_ALGORITHM_VERSION,
      )
    )
      return;
    void generateZooms(true).catch((error) =>
      console.error("Failed to generate zooms:", error),
    );
  },
  { immediate: true },
);

const updateZoom = (next: ZoomElement) => {
  if (next.startMs < 0 || next.endMs <= next.startMs) return;
  zoomElements.value = zoomElements.value.map((element) =>
    element.id === next.id ? next : element,
  );
  void saveZoomState().catch((error) =>
    console.error("Failed to save zoom:", error),
  );
};

const deleteSelectedZoom = () => {
  if (!selectedZoomId.value) return;
  zoomElements.value = zoomElements.value.filter(
    (element) => element.id !== selectedZoomId.value,
  );
  selectedZoomId.value = null;
  void saveZoomState().catch((error) =>
    console.error("Failed to delete zoom:", error),
  );
};

const handleSelectTab = (tab: string) => {
  activeTab.value = tab;
};

onMounted(() => {
  playerVideoSrc.value = props.videoSrc ?? "";
  capture.setWindowMode("editor");
  capture.maximize();
  if (props.project) void loadComposition(props.project.id);
});

watch(
  () => [props.project?.id, props.editorData?.sessionId],
  ([projectId]) => {
    if (projectId) void loadComposition(projectId);
  },
);

watch(
  () => props.videoSrc,
  (videoSrc) => {
    playerVideoSrc.value = videoSrc ?? "";
  },
);

watch(
  () => props.editorData?.videoSrc || playerVideoSrc.value,
  (source) => {
    if (!source) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0)
        sourceSize.value = {
          width: video.videoWidth,
          height: video.videoHeight,
        };
      video.removeAttribute("src");
      video.load();
    };
    video.src = source;
  },
  { immediate: true },
);
</script>

<template>
  <div class="editor-page">
    <!-- Window Titlebar / Header -->
    <Topbar
      :export-request="exportRequest"
      @back-to-hud="emit('back-to-hud')"
      @open-project="emit('open-project', $event)"
    />

    <!-- Main Workspace (Islands Layout) -->
    <div class="editor-workspace">
      <!-- Upper Section: Sidebar, Properties, Canvas -->
      <div class="workspace-upper">
        <!-- Sidebar Island -->
        <SidebarPanel :active-tab="activeTab" @select-tab="handleSelectTab" />

        <!-- Properties Island -->
        <PropertiesPanel
          :active-tab="activeTab"
          v-model:selectedCursor="selectedCursor"
          v-model:cursorSize="cursorSize"
          v-model:cursorColor="cursorColor"
          v-model:enableShadow="enableShadow"
          v-model:enableRipple="enableRipple"
          v-model:shadowBlur="shadowBlur"
          v-model:shadowColor="shadowColor"
          v-model:rippleColor="rippleColor"
          v-model:rippleSize="rippleSize"
          v-model:volume="volume"
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
          v-model:selectedBackground="selectedBackground"
          :background-groups="backgroundGroups"
          :selected-zoom="selectedZoom"
          :can-generate-zooms="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          :selected-composition-layer="selectedCaptionLayer"
          :composition="composition"
          :editor-data="editorData"
          @import:background="addBackground($event)"
          @update:zoom="updateZoom"
          @delete:zoom="deleteSelectedZoom"
          @generate:zooms="generateZooms()"
          @update:caption="updateCaption"
        />

        <!-- Canvas/Player Island -->
        <EditorCanvas
          v-model:isPlaying="isPlaying"
          v-model:currentTime="currentTime"
          :duration="duration"
          :selected-cursor="selectedCursor"
          :cursor-size="cursorSize"
          :cursor-color="cursorColor"
          :enable-shadow="enableShadow"
          :enable-ripple="enableRipple"
          :shadow-blur="shadowBlur"
          :shadow-color="shadowColor"
          :ripple-color="rippleColor"
          :ripple-size="rippleSize"
          :is-video-enabled="isVideoEnabled"
          :selected-background="selectedBackgroundMedia"
          :video-src="playerVideoSrc || ''"
          :editor-data="editorData"
          :zoom-elements="zoomElements"
          :selected-zoom="selectedZoom"
          :composition="composition"
          @update:zoom="updateZoom"
          @duration-change="duration = $event"
        />
      </div>

      <!-- Lower Section: Timeline (Full width) -->
      <div class="workspace-lower">
        <EditorTimeline
          v-model:currentTime="currentTime"
          v-model:isPlaying="isPlaying"
          :duration="duration"
          :video-src="playerVideoSrc"
          :editor-data="editorData"
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
          :zoom-elements="zoomElements"
          :selected-zoom-id="selectedZoomId"
          :composition="composition"
          :selected-composition-layer-id="selectedCompositionLayerId"
          :selected-camera-layer-id="selectedCameraLayer?.id ?? null"
          :is-camera-enabled="isCameraEnabled"
          @select:zoom="
            selectedZoomId = $event;
            activeTab = 'zoom';
          "
          @add:element="addCompositionElement"
          @select:composition-layer="
            selectedCompositionLayerId = $event;
            activeTab = 'caption';
          "
          @select:camera-layer="selectedCompositionLayerId = $event"
          @toggle:camera="toggleCamera"
          @toggle:camera-layer="toggleSelectedCamera"
          @split:camera="splitSelectedCamera"
          @trim:camera="trimSelectedCamera"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-page {
  width: 100vw;
  height: 100vh;
  /* Claude-inspired warm cream light theme background with a subtle grid pattern and soft warm gradient */
  background-color: var(--color-bg-surface);
  background-image: 
    /* Dotted grid pattern */
    radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px),
    /* Soft warm ambient amber glow at the top center/left */
    radial-gradient(
        circle at 30% 0%,
        rgba(255, 90, 31, 0.06) 0%,
        rgba(255, 90, 31, 0) 50%
      );
  background-size:
    24px 24px,
    100% 100%;
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
  overflow: hidden;
  transition: background-color 0.3s ease;
}

:global(.dark) .editor-page {
  /* Claude-inspired warm dark theme background */
  background-color: var(--color-bg-surface);
  background-image: 
    /* Dotted grid pattern */
    radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    /* Soft warm ambient amber glow */
    radial-gradient(
        circle at 30% 0%,
        rgba(255, 90, 31, 0.07) 0%,
        rgba(255, 90, 31, 0) 50%
      ),
    /* Soft dark vignette */
    radial-gradient(
        circle at 50% 50%,
        rgba(22, 21, 18, 0) 50%,
        rgba(13, 12, 10, 0.6) 100%
      );
}

.editor-titlebar {
  height: 40px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  padding: 0; /* No padding at all so left and right controls are completely flush */
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
}

.left-actions {
  gap: 8px;
}

.exit-btn {
  margin-right: 4px;
}

.right-actions {
  gap: 0; /* No gap so window-controls is flush */
  height: 100%;
}

.export-btn {
  margin-right: 12px; /* Add margin to keep gap from window controls */
}

.window-controls {
  display: flex;
  height: 100%;
  align-items: stretch;
}
</style>

<!-- Unscoped global styles for Titlebar Button overrides to avoid using :deep() -->
<style>
.editor-titlebar .titlebar-btn.btn-container {
  height: 100%;
  display: inline-flex;
}

.editor-titlebar .titlebar-btn .btn {
  height: 100%;
  border-radius: 0; /* corner to corner */
  border: none;
  background: transparent;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 0.875rem;
}

.editor-titlebar .exit-btn .btn {
  padding: 0 16px;
  gap: 8px;
}

.editor-titlebar .exit-btn .btn .btn-icon {
  width: 16px;
  height: 16px;
}

.editor-titlebar .window-controls .control-btn {
  width: 46px; /* standard windows titlebar button width */
  height: 100%;
  padding: 0;
  border-radius: 0; /* corner to corner */
  border: none;
  background: transparent;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
}

.editor-titlebar .window-controls .control-btn .btn-icon {
  width: 14px;
  height: 14px;
}

.editor-titlebar .window-controls .control-btn:hover {
  background: var(--color-bg-surface, #1e1e1e) !important;
  color: var(--text-primary) !important;
}

.editor-titlebar .window-controls .close-btn:hover {
  background: var(--color-error, #ef4444) !important;
  color: white !important;
}

/* Islands Workspace Layout */
.editor-workspace {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.workspace-upper {
  flex: 1;
  display: flex;
  gap: 8px; /* 8px gap between Sidebar, Properties & Canvas as requested */
  overflow: hidden;
}

.workspace-lower {
  height: auto;
  flex-shrink: 0;
}
</style>
