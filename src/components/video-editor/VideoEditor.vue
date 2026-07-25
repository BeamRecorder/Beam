<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import type { MediaCompositionLayer } from './composition/composition-types';
import SidebarPanel from "./sidebar/SidebarPanel.vue";
import PropertiesPanel from "./properties/PropertiesPanel.vue";
import EditorCanvas from "./canvas/EditorCanvas.vue";
import CanvasToolbar from "./canvas/CanvasToolbar.vue";
import EditorTimeline from "./timeline/EditorTimeline.vue";
import TimelineToolbar from "./timeline/TimelineToolbar.vue";
import Topbar from "./Topbar.vue";
import { useVideoEditor } from "./composables/useVideoEditor";
import { capture } from "../../api/capture";
import type { CaptureProject, ProjectEditorData } from "../../api/types/capture-api";
import { OUTPUT_CANVAS_PRESETS, type OutputCanvasPreset } from './canvas/output-canvas';

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

const emit = defineEmits<{
  (event: "back-to-hud"): void;
  (event: "open-project", project: CaptureProject): void;
}>();

// Master Video Editor Composable
const {
  activeTab,
  systemVolume,
  micVolume,
  sourceSize,
  player,
  cursor,
  compositionState,
  editorState,
  zoomState,
  exportRequest,
  outputCanvas,
  handleSelectTab,
} = useVideoEditor({
  videoSrc: toRef(props, "videoSrc"),
  project: toRef(props, "project"),
  editorData: toRef(props, "editorData"),
});

// Destructure Sub-Composables for Template Bindings
const {
  isPlaying,
  currentTime,
  duration,
  volume,
  videoSrc: playerVideoSrc,
  selectedBackground,
  selectedBackgroundMedia,
  backgroundBlurPercent,
  backgroundGroups,
  addBackground,
  isVideoEnabled,
  isSystemAudioEnabled,
  isMicAudioEnabled,
} = player;

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
} = cursor;

const {
  composition,
  selectedCompositionLayerId,
  selectedCompositionLayer,
  selectedClipInfo,
  selectedCaptionLayer,
  selectedCameraLayer,
  isCameraEnabled,
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
} = compositionState;
const selectedTransformLayer = computed<CompositionLayer | null>(() => {
  const layer = selectedCompositionLayer.value;
  if (layer && layer.kind !== 'audio') return layer;
  if (selectedCompositionLayerId.value === 'base-video') {
    return {
      id: 'base-video',
      kind: 'video',
      assetId: 'base-video',
      name: 'Screen recording',
      startMs: 0,
      endMs: duration.value * 1000,
      enabled: true,
      order: 0,
      transform: composition.value.baseVideoTransform ?? { x: 0, y: 0, width: 1, height: 1 },
      crop: composition.value.baseVideoCrop ?? { x: 0, y: 0, width: 1, height: 1 },
    };
  }
  return null;
});

const {
  zoomElements,
  selectedZoomId,
  selectedZoom,
  canGenerateZooms,
  hasAutomaticZooms,
  addZoomAtTime,
  generateZooms,
  updateZoom,
  previewZoomEdge,
  trimZoomEdge,
  previewZoom,
  deleteSelectedZoom,
} = zoomState;

onMounted(() => {
  playerVideoSrc.value = props.videoSrc ?? "";
  capture.setWindowMode("editor");
  capture.maximize();
  if (props.project) void loadComposition(props.project.id);
});

watch(
  () => props.videoSrc,
  (src) => {
    playerVideoSrc.value = src ?? "";
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

const updateOutputCanvas = (canvas: typeof outputCanvas.value) => {
  outputCanvas.value = canvas;
};
const updateSelectedBackground = (background: import('./composables/backgroundCatalog').BackgroundValue) => {
  selectedBackground.value = background;
  editorState.scheduleSave();
};
const isCropping = ref(false);
const timelineZoomLevel = ref(100);
// The canvas is the first useful part of the editor. Mounting the timeline starts
// media decoding, so deliberately let the browser paint and accept input first.
const isTimelineReady = ref(false);
let timelineStartupTimer: ReturnType<typeof setTimeout> | null = null;
let timelineStartupFrame: number | null = null;
const toggleCrop = () => {
  if (selectedTransformLayer.value) isCropping.value = !isCropping.value;
};
const selectCanvasPreset = (preset: Exclude<OutputCanvasPreset, 'custom'>) => {
  outputCanvas.value = { ...OUTPUT_CANVAS_PRESETS[preset], showBackground: false };
};

const handleSelectTransformLayer = (layerId: string) => {
  selectedCompositionLayerId.value = layerId;
  const layer = composition.value.layers.find((l) => l.id === layerId);
  if (layer?.kind === 'caption') {
    activeTab.value = 'caption';
  } else {
    activeTab.value = 'clip';
  }
};

const handleCropKeyDown = (e: KeyboardEvent) => {
  if ((e.key === 'Enter' || e.key === 'Escape') && isCropping.value) {
    isCropping.value = false;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const active = document.activeElement;
    if (active) {
      const tagName = active.tagName.toLowerCase();
      const isEditable = active.getAttribute('contenteditable') === 'true';
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
        return; // Ignore if typing inside input fields
      }
    }
    if (selectedCompositionLayerId.value && selectedCompositionLayerId.value !== 'base-video') {
      e.preventDefault();
      void deleteSelectedCompositionLayer();
    } else if (selectedZoom.value && activeTab.value === 'zoom') {
      e.preventDefault();
      deleteSelectedZoom();
    }
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleCropKeyDown);
  timelineStartupFrame = requestAnimationFrame(() => {
    timelineStartupFrame = requestAnimationFrame(() => {
      timelineStartupTimer = setTimeout(() => {
        isTimelineReady.value = true;
        timelineStartupTimer = null;
      }, 120);
    });
  });
});

const rawNativeDuration = ref(0);
const handleDurationChange = (nativeDuration: number) => {
  rawNativeDuration.value = nativeDuration;
  duration.value = nativeDuration / (composition.value.baseVideoPlaybackRate ?? 1.0);
};

watch(
  () => composition.value.baseVideoPlaybackRate ?? 1.0,
  (rate) => {
    if (rawNativeDuration.value > 0) {
      duration.value = rawNativeDuration.value / rate;
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCropKeyDown);
  if (timelineStartupFrame !== null) cancelAnimationFrame(timelineStartupFrame);
  if (timelineStartupTimer) clearTimeout(timelineStartupTimer);
});
</script>

<template>
  <div class="editor-page">
    <!-- Window Titlebar / Header -->
    <Topbar
      :export-request="exportRequest"
      :project="project"
      :is-saving="editorState.isSaving.value"
      @back-to-hud="emit('back-to-hud')"
      @open-project="emit('open-project', $event)"
    />

    <!-- Main Workspace (Islands Layout) -->
    <div class="editor-workspace">
      <!-- Upper Section: Sidebar, Properties, Canvas -->
      <div class="workspace-upper">
        <!-- Sidebar Island -->
        <SidebarPanel :active-tab="activeTab" @select-tab="handleSelectTab" />

        <!-- Properties Island (Right sidebar) -->
        <PropertiesPanel
          :activeTab="activeTab"
          :selected-clip="selectedClipInfo"
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
          v-model:systemVolume="systemVolume"
          v-model:micVolume="micVolume"
          v-model:isVideoEnabled="isVideoEnabled"
          v-model:isSystemAudioEnabled="isSystemAudioEnabled"
          v-model:isMicAudioEnabled="isMicAudioEnabled"
          :selected-background="selectedBackground"
          :blur-percent="backgroundBlurPercent"
          :background-groups="backgroundGroups"
          :selected-zoom="selectedZoom"
          :can-generate-zooms="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          :selected-composition-layer="selectedCompositionLayer"
          :selected-caption-layer="selectedCaptionLayer"
          :composition="composition"
          :editor-data="editorData"
          :project-id="project?.id"
          :canvas="outputCanvas"
          @import:background="addBackground($event)"
          @update:selected-background="updateSelectedBackground($event)"
          @update:blur-percent="backgroundBlurPercent = $event"
          @update:canvas="updateOutputCanvas($event)"
          @update:zoom="updateZoom"
          @delete:zoom="deleteSelectedZoom"
          @generate:zooms="generateZooms()"
          @update:caption="updateCaption"
          @update:composition="composition = $event; editorState.scheduleSave()"
          @select-caption="selectedCompositionLayerId = $event; activeTab = 'caption'"
          @delete-clip="deleteSelectedCompositionLayer()"
          @update:clip-rate="updateSelectedClipPlaybackRate"
          @unlink-clip="handleUnlinkClips"
          @update:clip-is-mirrored="updateSelectedClipIsMirrored"
          @update:clip-corner-radius="updateSelectedClipAppearance({ cornerRadius: (['none','sm','md','lg','full'].includes($event) ? $event as 'none' | 'sm' | 'md' | 'lg' | 'full' : parseFloat($event)) })"
          @update:clip-shadow="updateSelectedClipAppearance({ shadowSize: $event.size as 'none' | 'sm' | 'md' | 'lg', shadowColor: $event.color, shadowDirection: $event.direction as 'all' | 'bottom' | 'bottom-right' | 'top-left' })"
          @update:clip-transform="updateSelectedWebcamTransform"
          @reset:clip-transform="updateSelectedWebcamTransform({ x: 0, y: 0, width: 1, height: 1 })"
        />

        <div class="canvas-column">
        <CanvasToolbar :preset="outputCanvas.preset" :can-crop="Boolean(selectedTransformLayer)" :is-cropping="isCropping" @select:preset="selectCanvasPreset" @toggle:crop="toggleCrop" />
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
          :background-blur-percent="backgroundBlurPercent"
          :video-src="playerVideoSrc || ''"
          :editor-data="editorData"
          :zoom-elements="zoomElements"
          :selected-zoom="selectedZoom"
          :composition="composition"
          :output-canvas="outputCanvas"
          :active-tab="activeTab"
          :selected-transform-layer="selectedTransformLayer"
          :is-cropping="isCropping"
          @update:zoom="updateZoom"
          @preview:zoom="previewZoom"
          @select:transform-layer="handleSelectTransformLayer($event)"
          @select:base-video="selectBaseVideo()"
          @select:canvas="selectedCompositionLayerId = null; activeTab = 'canvas'; isCropping = false"
          @deselect:transform-layer="selectedCompositionLayerId = null; isCropping = false"
          @update:layer-transform="updateSelectedWebcamTransform"
          @preview:layer-transform="previewSelectedWebcamTransform"
          @done:crop="isCropping = false"
          @deselect:zoom="selectedZoomId = null"
          @duration-change="handleDurationChange"
        />
        <TimelineToolbar :current-time="currentTime" :duration="duration" :is-playing="isPlaying" v-model:zoom-level="timelineZoomLevel" @update:is-playing="isPlaying = $event" @update:current-time="currentTime = $event" @add:element="addCompositionElement" />
        </div>
      </div>

      <!-- Lower Section: Timeline (Full width) -->
      <div class="workspace-lower">
        <EditorTimeline
          v-if="isTimelineReady"
          v-model:currentTime="currentTime"
          v-model:isPlaying="isPlaying"
          :duration="duration"
          v-model:zoom-level="timelineZoomLevel"
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
            activeTab = composition.layers.find(l => l.id === $event)?.kind === 'caption' ? 'caption' : 'clip';
          "
          @select:base-video="selectBaseVideo"
          @select:camera-layer="
            selectedCompositionLayerId = $event;
            activeTab = composition.layers.find(l => l.id === $event)?.kind === 'caption' ? 'caption' : 'clip';
          "
          @toggle:camera="toggleCamera"
          @toggle:camera-layer="toggleSelectedCamera"
          @split:camera="splitSelectedCamera"
          @trim:camera="trimSelectedCamera"
          @unlink="handleUnlinkClips"
          @unlink-track="handleUnlinkTrack"
          @trim:clip-edge="({ id, edge, timeMs }) => {
            if (zoomElements.some(z => z.id === id)) {
              trimZoomEdge(id, edge, timeMs);
            } else {
              trimLayerEdge(id, edge, timeMs);
            }
          }"
          @preview:clip-edge="({ id, edge, timeMs }) => {
            if (zoomElements.some(z => z.id === id)) {
              previewZoomEdge(id, edge, timeMs);
            } else {
              previewLayerEdge(id, edge, timeMs);
            }
          }"
          @add:zoom="addZoomAtTime"
          @add:caption="addCaptionAtTime"
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

/* Workspace Flush Dock Layout */
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
  gap: 12px;
  overflow: hidden;
}

.canvas-column { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }

.workspace-lower {
  height: auto;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  overflow: hidden;
}
</style>
