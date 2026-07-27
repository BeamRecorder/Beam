<script setup lang="ts">
import { computed } from "vue";
import type { CursorType } from "./cursor/useCursorReplacer";
import type {
  BackgroundMedia,
  BackgroundValue,
  BackgroundMediaGroup,
} from "../composables/backgroundCatalog";
import CursorPanel from "./cursor/CursorPanel.vue";
import CanvasPanel from "./canvas/CanvasPanel.vue";
import TrimPanel from "./TrimPanel.vue";
import AudioPanel from "./AudioPanel.vue";
import ZoomPanel from "./ZoomPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";
import ClipPropertiesPanel from "./clip/ClipPropertiesPanel.vue";
import AudioClipPropertiesPanel from "./clip/AudioClipPropertiesPanel.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import CaptionPanel from "./captions/CaptionPanel.vue";
import CaptionClipPanel from "./captions/CaptionClipPanel.vue";
import type {
  CompositionLayer,
  CaptionCompositionLayer,
  ProjectComposition,
} from "../composition/composition-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { OutputCanvasSettings } from "../canvas/output-canvas";
import type { NormalizedTransform } from "../composition/composition-types";
import type { ShadowDirection } from './shadow-types';

const props = defineProps<{
  activeTab: string;

  // Selected clip for clip tab
  selectedClip?: {
    id: string;
    kind: string;
    name?: string;
    timelineStartMs: number;
    timelineDurationMs: number;
    playbackRate?: number;
    enabled?: boolean;
    isLinked?: boolean;
    shadowSize?: string;
    shadowColor?: string;
    shadowDirection?: string;
    cornerRadius?: string | number;
    borderEnabled?: boolean;
    borderColor?: string;
    borderWidth?: number;
    frame?: import("../composition/composition-types").ClipFrame;
    frameTitle?: string;
    frameColor?: string;
    frameShowMenu?: boolean;
    frameShowScrollbars?: boolean;
    clipTransform?: NormalizedTransform;
    volume?: number;
  } | null;

  // Cursor properties
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  enableClickSpring: boolean;
  enableRipple: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  rippleColor: string;
  rippleSize: number;

  // Audio properties
  volume: number;
  isVideoEnabled: boolean;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  systemVolume?: number;
  micVolume?: number;

  // Background properties
  selectedBackground: BackgroundValue | null;
  blurPercent: number;
  backgroundGroups: BackgroundMediaGroup[];
  selectedZoom: ZoomElement | null;
  canGenerateZooms: boolean;
  hasAutomaticZooms: boolean;
  selectedCompositionLayer: CompositionLayer | null;
  selectedCaptionLayer?: CaptionCompositionLayer | null;
  composition: ProjectComposition;
  editorData?: ProjectEditorData | null;
  projectId?: string | null;
  canvas: OutputCanvasSettings;
}>();

const emit = defineEmits<{
  (e: "update:selectedCursor", value: CursorType): void;
  (e: "update:cursorSize", value: number): void;
  (e: "update:cursorColor", value: string): void;
  (e: "update:enableShadow", value: boolean): void;
  (e: "update:enableClickSpring", value: boolean): void;
  (e: "update:enableRipple", value: boolean): void;
  (e: "update:shadowBlur", value: number): void;
  (e: "update:shadowColor", value: string): void;
  (e: "update:shadowDirection", value: ShadowDirection): void;
  (e: "update:rippleColor", value: string): void;
  (e: "update:rippleSize", value: number): void;
  (e: "update:volume", value: number): void;
  (e: "update:isSystemAudioEnabled", value: boolean): void;
  (e: "update:isMicAudioEnabled", value: boolean): void;
  (e: "update:systemVolume", value: number): void;
  (e: "update:micVolume", value: number): void;
  (e: "update:selectedBackground", value: BackgroundValue): void;
  (e: "update:blurPercent", value: number): void;
  (e: "import:background", value: BackgroundMedia): void;
  (e: "update:canvas", value: OutputCanvasSettings): void;
  (e: "update:zoom", value: ZoomElement): void;
  (e: "delete:zoom"): void;
  (e: "generate:zooms"): void;
  (e: "update:caption", value: CaptionCompositionLayer): void;
  (e: "update:composition", value: ProjectComposition): void;
  (e: "select-caption", layerId: string): void;
  (e: "update:clip-rate", rate: number): void;
  (e: "update:clip-enabled", enabled: boolean): void;
  (e: "update:clip-volume", volume: number): void;
  (e: "update:clip-is-mirrored", isMirrored: boolean): void;
  (e: "update:clip-corner-radius", radius: string): void;
  (
    e: "update:clip-shadow",
    shadow: { size: string; color?: string; direction?: string },
  ): void;
  (e: "update:clip-appearance", appearance: { borderEnabled?: boolean; borderColor?: string; borderWidth?: number; frame?: import("../composition/composition-types").ClipFrame; frameTitle?: string; frameColor?: string; frameShowMenu?: boolean; frameShowScrollbars?: boolean }): void;
  (e: "update:clip-transform", transform: NormalizedTransform): void;
  (e: "reset:clip-transform"): void;
  (e: "unlink-clip"): void;
  (e: "delete-clip"): void;
  (e: "split-clip"): void;
}>();

const activeCaptionLayer = computed<CaptionCompositionLayer | null>(() => {
  if (props.selectedCaptionLayer) return props.selectedCaptionLayer;
  if (props.selectedCompositionLayer?.kind === "caption") {
    return props.selectedCompositionLayer;
  }
  return null;
});
</script>

<template>
  <div class="properties-island">
    <div class="panel-header">
      <h3 class="panel-title">
        {{ activeTab === "canvas" ? "Background" : "Properties" }}
      </h3>
    </div>

    <div class="panel-content">
      <CanvasPanel
        v-if="activeTab === 'canvas'"
        key="canvas-panel"
        :selected-background="selectedBackground"
        :blur-percent="blurPercent"
        :background-groups="backgroundGroups"
        :project-id="projectId"
        @update:selectedBackground="emit('update:selectedBackground', $event)"
        @update:blurPercent="emit('update:blurPercent', $event)"
        @import:background="emit('import:background', $event)"
      />

      <AudioClipPropertiesPanel
        v-else-if="activeTab === 'clip' && selectedClip?.kind === 'audio'"
        key="audio-clip-properties-panel"
        :clip="selectedClip || null"
        @update:volume="emit('update:clip-volume', $event)"
        @update:enabled="emit('update:clip-enabled', $event)"
        @delete="emit('delete-clip')"
      />

      <CaptionClipPanel
        v-else-if="activeTab === 'clip' && activeCaptionLayer"
        key="caption-clip-panel"
        :layer="activeCaptionLayer"
        @update="emit('update:caption', $event)"
        @delete="emit('delete-clip')"
      />

      <ClipPropertiesPanel
        v-else-if="activeTab === 'clip'"
        key="clip-properties-panel"
        :selected-clip="selectedClip || null"
        @update:playback-rate="emit('update:clip-rate', $event)"
        @update:enabled="emit('update:clip-enabled', $event)"
        @update:is-mirrored="emit('update:clip-is-mirrored', $event)"
        @update:corner-radius="emit('update:clip-corner-radius', $event)"
        @update:shadow="emit('update:clip-shadow', $event)"
        @update:appearance="emit('update:clip-appearance', $event)"
        @update:clip-transform="emit('update:clip-transform', $event)"
        @reset:clip-transform="emit('reset:clip-transform')"
        @unlink="emit('unlink-clip')"
        @delete="emit('delete-clip')"
        @split="emit('split-clip')"
      />

      <CursorPanel
        v-else-if="activeTab === 'cursor'"
        key="cursor-panel"
        :selectedCursor="selectedCursor"
        :cursorSize="cursorSize"
        :cursorColor="cursorColor"
        :enableShadow="enableShadow"
        :enableClickSpring="enableClickSpring"
        :enableRipple="enableRipple"
        :shadowBlur="shadowBlur"
        :shadowColor="shadowColor"
        :shadowDirection="shadowDirection"
        :rippleColor="rippleColor"
        :rippleSize="rippleSize"
        @update:selectedCursor="emit('update:selectedCursor', $event)"
        @update:cursorSize="emit('update:cursorSize', $event)"
        @update:cursorColor="emit('update:cursorColor', $event)"
        @update:enableShadow="emit('update:enableShadow', $event)"
        @update:enableClickSpring="emit('update:enableClickSpring', $event)"
        @update:enableRipple="emit('update:enableRipple', $event)"
        @update:shadowBlur="emit('update:shadowBlur', $event)"
        @update:shadowColor="emit('update:shadowColor', $event)"
        @update:shadowDirection="emit('update:shadowDirection', $event)"
        @update:rippleColor="emit('update:rippleColor', $event)"
        @update:rippleSize="emit('update:rippleSize', $event)"
      />

      <TrimPanel v-else-if="activeTab === 'trim'" key="trim-panel" />

      <AudioPanel
        v-else-if="activeTab === 'audio'"
        key="audio-panel"
        :volume="volume"
        :isSystemAudioEnabled="isSystemAudioEnabled"
        :isMicAudioEnabled="isMicAudioEnabled"
        :systemVolume="systemVolume"
        :micVolume="micVolume"
        @update:volume="emit('update:volume', $event)"
        @update:isSystemAudioEnabled="
          emit('update:isSystemAudioEnabled', $event)
        "
        @update:isMicAudioEnabled="emit('update:isMicAudioEnabled', $event)"
        @update:systemVolume="emit('update:systemVolume', $event)"
        @update:micVolume="emit('update:micVolume', $event)"
      />

      <ZoomPanel
        v-else-if="activeTab === 'zoom'"
        key="zoom-panel"
        :selected-zoom="selectedZoom"
        :can-generate="canGenerateZooms"
        :has-automatic-zooms="hasAutomaticZooms"
        @update="emit('update:zoom', $event)"
        @delete="emit('delete:zoom')"
        @generate="emit('generate:zooms')"
      />

      <CaptionPanel
        v-else-if="activeTab === 'caption'"
        key="caption-generator-panel"
        :composition="composition"
        :editor-data="editorData"
        @update:composition="emit('update:composition', $event)"
        @select-caption="emit('select-caption', $event)"
      />

      <SettingsPanel v-else-if="activeTab === 'settings'" />
    </div>
  </div>
</template>

<style scoped>
.properties-island {
  width: 400px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px 0 20px 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
  box-sizing: border-box;
}

.panel-header {
  padding-bottom: 4px;
  padding-right: 20px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 14px;
  box-sizing: border-box;
}

.panel-content::-webkit-scrollbar {
  width: 5px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
