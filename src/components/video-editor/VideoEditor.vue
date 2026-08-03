<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import type { CaptureProject, ProjectEditorData } from "~/api/types/capture-api";
import SidebarPanel from "~/components/video-editor/sidebar/SidebarPanel.vue";
import PropertiesPanel from "~/components/video-editor/properties/PropertiesPanel.vue";
import EditorCanvas from "~/components/video-editor/canvas/EditorCanvas.vue";
import CanvasToolbar from "~/components/video-editor/canvas/CanvasToolbar.vue";
import EditorTimeline from "~/components/video-editor/timeline/EditorTimeline.vue";
import TimelineToolbar from "~/components/video-editor/timeline/TimelineToolbar.vue";
import Topbar from "~/components/video-editor/Topbar.vue";
import { useVideoEditor } from "~/components/video-editor/composables/useVideoEditor";
import { useEditorUndoRedo, type EditorStateSnapshot } from "~/components/video-editor/composables/useEditorUndoRedo";
import { capture } from "~/api/capture";
import { Sparkles } from "@lucide/vue";
import { useTranslate } from "~/i18n/useTranslate";
import { useExportJob } from "~/components/export/useExportJob";
import { OUTPUT_CANVAS_PRESETS, type OutputCanvasPreset } from "~/components/video-editor/canvas/output-canvas";
import { compositionDurationMs, setVolume } from "~/components/video-editor/composition/engine/clip-engine";
import { isAudioClip, isCaptionClip, isVisualClip } from "~/components/video-editor/composition/composition-types";

const { t } = useTranslate("VideoEditor");
const props = withDefaults(defineProps<{
  videoSrc?: string | null;
  project?: CaptureProject | null;
  editorData?: ProjectEditorData | null;
}>(), { videoSrc: null, project: null, editorData: null });
const emit = defineEmits<{
  (event: "back-to-hud"): void;
  (event: "open-project", project: CaptureProject): void;
  (event: "start-recording", config: any): void;
}>();

const {
  activeTab,
  systemVolume,
  micVolume,
  sourceSize,
  player,
  cursor,
  cursorMotion,
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
} = player;
const {
  selectedCursor,
  cursorSize,
  cursorColor,
  enableShadow,
  shadowBlur,
  shadowColor,
  shadowDirection,
  clickEffects,
} = cursor;
const {
  composition,
  selectedClipId,
  selectedClip,
  selectedClipInfo,
  selectedCaptionClip,
  isVideoEnabled,
  isWebcamEnabled,
  isSystemAudioEnabled,
  isMicAudioEnabled,
  selectClip,
  addElement,
  addCaptionAtTime,
  updateCaption,
  trimClipEdge,
  moveClipTo,
  splitSelectedClip,
  deleteSelectedClip,
  reorderVisualClip,
  updateSelectedAppearance,
  updateSelectedTransform,
  previewSelectedTransform,
  updateSelectedCrop,
  updateSelectedMirrored,
  updateSelectedMirroredY,
  updateSelectedRate,
  updateSelectedVolume,
  updateSelectedEnabled,
  toggleClip,
  detachSelectedClip,
} = compositionState;
const {
  zoomElements,
  selectedZoomId,
  selectedZoom,
  canGenerateZooms,
  hasAutomaticZooms,
  addZoomAtTime,
  generateZooms,
  updateZoom,
  trimZoomEdge,
  moveZoom,
  previewZoom,
  deleteSelectedZoom,
} = zoomState;
const { isExporting, progress: exportProgress } = useExportJob();
const selectedTransformClip = computed(() => {
  const clip = selectedClip.value;
  return clip && (isVisualClip(clip) || isCaptionClip(clip)) ? clip : null;
});

const addTimelineElement = (kind: "video" | "image" | "sound" | "caption") => {
  void addElement(kind).catch((error) => console.error("Unable to add media:", error));
};
const selectEditorClip = (clipId: string) => {
  selectClip(clipId);
  activeTab.value = isAudioClip(composition.value.clips.find((clip) => clip.id === clipId)!) ? "audio" : "clip";
};
const replaceComposition = (value: typeof composition.value) => {
  composition.value = value;
  editorState.scheduleSave();
};
const updateRoleVolume = (role: "system" | "microphone", value: number) => {
  let next = composition.value;
  for (const clip of next.clips) if (isAudioClip(clip) && clip.role === role) next = setVolume(next, clip.id, value);
  composition.value = next;
};
watch(systemVolume, (value) => updateRoleVolume("system", value));
watch(micVolume, (value) => updateRoleVolume("microphone", value));
watch(composition, (value) => {
  duration.value = compositionDurationMs(value) / 1_000;
  if (currentTime.value > duration.value) currentTime.value = duration.value;
}, { deep: true, immediate: true });

// Editor state only contains JSON data. Serializing first unwraps Vue proxies, so
// history snapshots stay cloneable after any reactive edit.
const cloneSerializable = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const createEditorSnapshot = (): EditorStateSnapshot => ({
  composition: cloneSerializable(composition.value),
  zoomElements: cloneSerializable(zoomElements.value),
  outputCanvas: cloneSerializable(outputCanvas.value),
  selectedBackground: selectedBackground.value ? cloneSerializable(selectedBackground.value) : null,
  backgroundBlurPercent: backgroundBlurPercent.value,
});
const { recordSnapshot, undo, redo, canUndo, canRedo, lastAction: historyAction } = useEditorUndoRedo({
  onRestoreSnapshot: async (snapshot) => {
    composition.value = snapshot.composition;
    zoomElements.value = snapshot.zoomElements;
    outputCanvas.value = snapshot.outputCanvas;
    selectedBackground.value = snapshot.selectedBackground;
    backgroundBlurPercent.value = snapshot.backgroundBlurPercent;
    await editorState.saveNow();
  },
});
let historyInitialized = false;
watch(editorState.loading, (loading) => {
  if (loading || historyInitialized) return;
  historyInitialized = true;
  recordSnapshot(createEditorSnapshot());
}, { immediate: true });
watch([composition, zoomElements, outputCanvas, selectedBackground, backgroundBlurPercent], () => {
  if (historyInitialized && !editorState.loading.value) recordSnapshot(createEditorSnapshot(), 300);
}, { deep: true });

onMounted(() => {
  playerVideoSrc.value = props.videoSrc ?? "";
  capture.setWindowMode("editor");
  capture.maximize();
});
watch(() => props.videoSrc, (src) => { playerVideoSrc.value = src ?? ""; });
const screenSource = computed(() => {
  const screen = composition.value.clips.find((clip) => clip.kind === "screen");
  return screen ? composition.value.assets.find((asset) => asset.id === screen.assetId)?.src ?? null : props.editorData?.videoSrc ?? props.videoSrc;
});
watch(screenSource, (source) => {
  if (!source) return;
  const video = document.createElement("video");
  video.preload = "metadata";
  video.onloadedmetadata = () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) sourceSize.value = { width: video.videoWidth, height: video.videoHeight };
    video.removeAttribute("src");
    video.load();
  };
  video.src = source;
}, { immediate: true });

const isCropping = ref(false);
const isGridVisible = ref(false);
const timelineZoomLevel = ref(100);
const isSnappingEnabled = ref(true);
const isTimelineReady = ref(false);
let timelineTimer: ReturnType<typeof setTimeout> | null = null;
let timelineFrame: number | null = null;
const editorCanvasRef = ref<InstanceType<typeof EditorCanvas> | null>(null);
const toggleCrop = () => { if (selectedTransformClip.value && isVisualClip(selectedTransformClip.value)) isCropping.value = !isCropping.value; };
const selectCanvasPreset = (preset: Exclude<OutputCanvasPreset, "custom">) => { outputCanvas.value = { ...OUTPUT_CANVAS_PRESETS[preset], showBackground: false }; };
const handleKeyDown = (event: KeyboardEvent) => {
  if ((event.key === "Enter" || event.key === "Escape") && isCropping.value) isCropping.value = false;
  const active = document.activeElement;
  if (active) {
    const tag = active.tagName.toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || active.getAttribute("contenteditable") === "true") return;
  }
  if ((event.key === "s" || event.key === "S") && selectedClipId.value) {
    event.preventDefault();
    splitSelectedClip();
    return;
  }
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (selectedClipId.value) { event.preventDefault(); deleteSelectedClip(); }
  else if (selectedZoom.value && activeTab.value === "zoom") { event.preventDefault(); deleteSelectedZoom(); }
};
onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  timelineFrame = requestAnimationFrame(() => {
    timelineFrame = requestAnimationFrame(() => {
      timelineTimer = setTimeout(() => { isTimelineReady.value = true; timelineTimer = null; }, 120);
    });
  });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
  if (timelineFrame !== null) cancelAnimationFrame(timelineFrame);
  if (timelineTimer) clearTimeout(timelineTimer);
});
</script>

<template>
  <div class="editor-page">
    <Topbar :export-request="exportRequest" :project="project" :is-saving="editorState.isSaving.value" :can-undo="canUndo" :can-redo="canRedo" @back-to-hud="emit('back-to-hud')" @open-project="emit('open-project', $event)" @undo="undo" @redo="redo" />
    <div v-if="isExporting" class="export-notice-banner"><Sparkles :size="14" class="banner-icon" /><span>{{ t('exportBanner') }}</span></div>
    <div class="editor-workspace">
      <div class="workspace-upper">
        <SidebarPanel :active-tab="activeTab" @select-tab="handleSelectTab" />
        <PropertiesPanel
          :active-tab="activeTab"
          :selected-clip="selectedClipInfo"
          :selected-caption-clip="selectedCaptionClip"
          v-model:selected-cursor="selectedCursor"
          v-model:cursor-size="cursorSize"
          v-model:cursor-color="cursorColor"
          v-model:enable-shadow="enableShadow"
          v-model:shadow-blur="shadowBlur"
          v-model:shadow-color="shadowColor"
          v-model:shadow-direction="shadowDirection"
          v-model:click-effects="clickEffects"
          v-model:motion="cursorMotion"
          v-model:volume="volume"
          v-model:system-volume="systemVolume"
          v-model:mic-volume="micVolume"
          v-model:is-system-audio-enabled="isSystemAudioEnabled"
          v-model:is-mic-audio-enabled="isMicAudioEnabled"
          :selected-background="selectedBackground"
          :blur-percent="backgroundBlurPercent"
          :background-groups="backgroundGroups"
          :selected-zoom="selectedZoom"
          :can-generate-zooms="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          :composition="composition"
          :editor-data="editorData"
          :timeline-duration-ms="Math.round(duration * 1000)"
          :project-id="project?.id"
          :canvas="outputCanvas"
          @import:background="addBackground($event)"
          @update:selected-background="selectedBackground = $event"
          @update:blur-percent="backgroundBlurPercent = $event"
          @update:canvas="outputCanvas = $event"
          @update:zoom="updateZoom"
          @delete:zoom="deleteSelectedZoom"
          @generate:zooms="generateZooms()"
          @update:caption="updateCaption"
          @update:composition="replaceComposition"
          @select-caption="selectEditorClip"
          @delete-clip="deleteSelectedClip"
          @split-clip="splitSelectedClip"
          @update:clip-rate="updateSelectedRate"
          @update:clip-volume="updateSelectedVolume"
          @update:clip-enabled="updateSelectedEnabled"
          @unlink-clip="detachSelectedClip"
          @update:clip-is-mirrored="updateSelectedMirrored"
          @update:clip-is-mirrored-y="updateSelectedMirroredY"
          @update:clip-corner-radius="updateSelectedAppearance({ cornerRadius: ['none','sm','md','lg','full'].includes($event) ? $event as 'none' | 'sm' | 'md' | 'lg' | 'full' : Number($event) })"
          @update:clip-shadow="updateSelectedAppearance({ shadowSize: $event.size as 'none' | 'sm' | 'md' | 'lg' | 'custom', shadowBlur: Number($event.blur ?? 40), shadowMode: ($event.mode ?? 'solid') as 'solid' | 'adaptive', shadowColor: $event.color ?? '#000000', shadowDirection: ($event.direction ?? 'bottom') as 'all' | 'bottom' | 'bottom-right' | 'top-left' })"
          @update:clip-appearance="updateSelectedAppearance($event)"
          @update:clip-transform="updateSelectedTransform"
          @reset:clip-transform="updateSelectedTransform({ x: 0, y: 0, width: 1, height: 1 })"
          @back-to-hud="emit('back-to-hud')"
          @start-recording="emit('start-recording', $event)"
        />

        <div class="canvas-column">
          <CanvasToolbar
            :preset="outputCanvas.preset"
            :can-crop="Boolean(selectedTransformClip && isVisualClip(selectedTransformClip))"
            :is-cropping="isCropping"
            :is-grid-visible="isGridVisible"
            :zoom-percent="editorCanvasRef?.viewportZoom.zoomPercent.value ?? 100"
            :is-zoomed-or-panned="editorCanvasRef?.viewportZoom.isZoomedOrPanned.value ?? false"
            @select:preset="selectCanvasPreset"
            @toggle:crop="toggleCrop"
            @toggle:grid="isGridVisible = !isGridVisible"
            @zoom:in="editorCanvasRef?.viewportZoom.zoomIn()"
            @zoom:out="editorCanvasRef?.viewportZoom.zoomOut()"
            @reset:zoom="editorCanvasRef?.viewportZoom.resetZoom()"
          />
          <EditorCanvas
            ref="editorCanvasRef"
            v-model:is-playing="isPlaying"
            v-model:current-time="currentTime"
            :duration="duration"
            :selected-cursor="selectedCursor"
            :cursor-size="cursorSize"
            :cursor-color="cursorColor"
            :enable-shadow="enableShadow"
            :shadow-blur="shadowBlur"
            :shadow-color="shadowColor"
            :shadow-direction="shadowDirection"
            :click-effects="clickEffects"
            :motion="cursorMotion"
            :selected-background="selectedBackgroundMedia"
            :background-blur-percent="backgroundBlurPercent"
            :video-src="playerVideoSrc || ''"
            :editor-data="editorData"
            :zoom-elements="zoomElements"
            :selected-zoom="selectedZoom"
            :composition="composition"
            :output-canvas="outputCanvas"
            :active-tab="activeTab"
            :selected-transform-clip="selectedTransformClip"
            :is-cropping="isCropping"
            :is-grid-visible="isGridVisible"
            :history-action="historyAction"
            @update:zoom="updateZoom"
            @preview:zoom="previewZoom"
            @select:clip="selectEditorClip"
            @select:canvas="selectedClipId = null; activeTab = 'canvas'; isCropping = false"
            @deselect:transform-clip="selectedClipId = null; isCropping = false"
            @update:clip-transform="updateSelectedTransform"
            @preview:clip-transform="previewSelectedTransform"
            @update:clip-crop="updateSelectedCrop"
            @done:crop="isCropping = false"
            @deselect:zoom="selectedZoomId = null"
          />
          <TimelineToolbar :current-time="currentTime" :duration="duration" :is-playing="isPlaying" :can-split="Boolean(selectedClipId)" v-model:zoom-level="timelineZoomLevel" v-model:is-snapping-enabled="isSnappingEnabled" @update:is-playing="isPlaying = $event" @update:current-time="currentTime = $event" @add:element="addTimelineElement" @split="splitSelectedClip" />
        </div>
      </div>
      <div class="workspace-lower">
        <EditorTimeline
          v-if="isTimelineReady"
          v-model:current-time="currentTime"
          v-model:is-playing="isPlaying"
          v-model:zoom-level="timelineZoomLevel"
          :is-snapping-enabled="isSnappingEnabled"
          :duration="duration"
          :export-progress="exportProgress"
          :zoom-elements="zoomElements"
          :selected-zoom-id="selectedZoomId"
          :composition="composition"
          :selected-clip-id="selectedClipId"
          @select:zoom="selectedZoomId = $event; activeTab = 'zoom'"
          @select:clip="selectEditorClip"
          @toggle:clip="toggleClip"
          @trim:clip="trimClipEdge($event.id, $event.edge, $event.timeMs)"
          @move:clip="moveClipTo($event.id, $event.startMs)"
          @trim:zoom="trimZoomEdge($event.id, $event.edge, $event.timeMs)"
          @move:zoom="moveZoom($event.id, $event.startMs, $event.endMs)"
          @add:zoom="addZoomAtTime"
          @add:caption="addCaptionAtTime"
          @reorder:clip="reorderVisualClip($event.id, $event.targetIndex)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-notice-banner { display: flex; align-items: center; gap: 8px; background: var(--color-primary-light, rgba(255,90,31,.12)); border: 1px solid var(--color-primary); color: var(--color-primary); padding: 8px 16px; border-radius: var(--radius-md); font-size: 12px; font-weight: 600; margin: 8px 20px -4px; user-select: none; z-index: 10; }.banner-icon { flex-shrink: 0; }
.editor-page { width: 100vw; height: 100vh; background-color: var(--color-bg-surface); background-image: radial-gradient(rgba(0,0,0,.05) 1px, transparent 1px), radial-gradient(circle at 30% 0%, rgba(255,90,31,.06), rgba(255,90,31,0) 50%); background-size: 24px 24px, 100% 100%; display: flex; flex-direction: column; color: var(--text-primary); overflow: hidden; transition: background-color .3s ease; }
:global(.dark) .editor-page { background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px), radial-gradient(circle at 30% 0%, rgba(255,90,31,.07), rgba(255,90,31,0) 50%), radial-gradient(circle at 50% 50%, rgba(22,21,18,0) 50%, rgba(13,12,10,.6) 100%); }
.editor-workspace { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }.workspace-upper { flex: 1; display: flex; gap: 12px; overflow: hidden; }.canvas-column { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }.workspace-lower { height: auto; flex-shrink: 0; border-radius: var(--radius-lg); overflow: hidden; }
</style>
