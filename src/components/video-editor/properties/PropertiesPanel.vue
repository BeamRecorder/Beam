<script setup lang="ts">
import { computed } from "vue";
import type { CursorType } from "./cursor/useCursorReplacer";
import type { BackgroundMedia, BackgroundValue, BackgroundMediaGroup } from "../composables/backgroundCatalog";
import CursorPanel from "./cursor/CursorPanel.vue";
import CanvasPanel from "./canvas/CanvasPanel.vue";
import AudioPanel from "./AudioPanel.vue";
import ZoomPanel from "./ZoomPanel.vue";
import SettingsPanel from "./SettingsPanel.vue";
import ClipPropertiesPanel from "./clip/ClipPropertiesPanel.vue";
import AudioClipPropertiesPanel from "./clip/AudioClipPropertiesPanel.vue";
import CaptionPanel from "./captions/CaptionPanel.vue";
import CaptionClipPanel from "./captions/CaptionClipPanel.vue";
import type { ZoomElement } from "../zoom/zoom-types";
import type { CaptionClip, ClipComposition, ClipFrame, NormalizedTransform } from "../composition/composition-types";
import type { ProjectEditorData } from "../../../api/types/capture-api";
import type { OutputCanvasSettings } from "../canvas/output-canvas";
import type { ShadowDirection } from "./shadow-types";
import type { CursorClickEffects } from "../../../api/types/cursor-settings";
import { useTranslate } from "~/i18n/useTranslate";

const { t } = useTranslate("PropertiesPanel");
export interface SelectedClipProperties {
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
  frame?: ClipFrame;
  frameTitle?: string;
  frameColor?: string;
  frameShowMenu?: boolean;
  frameShowScrollbars?: boolean;
  clipTransform?: NormalizedTransform;
  volume?: number;
}
const props = defineProps<{
  activeTab: string;
  selectedClip?: SelectedClipProperties | null;
  selectedCaptionClip?: CaptionClip | null;
  selectedCursor: CursorType;
  cursorSize: number;
  cursorColor: string;
  enableShadow: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowDirection: ShadowDirection;
  clickEffects: CursorClickEffects;
  volume: number;
  isSystemAudioEnabled: boolean;
  isMicAudioEnabled: boolean;
  systemVolume?: number;
  micVolume?: number;
  selectedBackground: BackgroundValue | null;
  blurPercent: number;
  backgroundGroups: BackgroundMediaGroup[];
  selectedZoom: ZoomElement | null;
  canGenerateZooms: boolean;
  hasAutomaticZooms: boolean;
  composition: ClipComposition;
  editorData?: ProjectEditorData | null;
  timelineDurationMs: number;
  projectId?: string | null;
  canvas: OutputCanvasSettings;
}>();
const normalizedSelectedClip = computed(() => props.selectedClip
  ? { ...props.selectedClip, kind: props.selectedClip.kind === "screen" ? "video" : props.selectedClip.kind }
  : null);
const emit = defineEmits<{
  (event: "update:selectedCursor", value: CursorType): void;
  (event: "update:cursorSize", value: number): void;
  (event: "update:cursorColor", value: string): void;
  (event: "update:enableShadow", value: boolean): void;
  (event: "update:shadowBlur", value: number): void;
  (event: "update:shadowColor", value: string): void;
  (event: "update:shadowDirection", value: ShadowDirection): void;
  (event: "update:clickEffects", value: CursorClickEffects): void;
  (event: "update:volume", value: number): void;
  (event: "update:isSystemAudioEnabled", value: boolean): void;
  (event: "update:isMicAudioEnabled", value: boolean): void;
  (event: "update:systemVolume", value: number): void;
  (event: "update:micVolume", value: number): void;
  (event: "update:selectedBackground", value: BackgroundValue): void;
  (event: "update:blurPercent", value: number): void;
  (event: "import:background", value: BackgroundMedia): void;
  (event: "update:canvas", value: OutputCanvasSettings): void;
  (event: "update:zoom", value: ZoomElement): void;
  (event: "delete:zoom"): void;
  (event: "generate:zooms"): void;
  (event: "update:caption", value: CaptionClip): void;
  (event: "update:composition", value: ClipComposition): void;
  (event: "select-caption", clipId: string): void;
  (event: "update:clip-rate", rate: number): void;
  (event: "update:clip-enabled", enabled: boolean): void;
  (event: "update:clip-volume", volume: number): void;
  (event: "update:clip-is-mirrored", isMirrored: boolean): void;
  (event: "update:clip-corner-radius", radius: string): void;
  (event: "update:clip-shadow", shadow: { size: string; color?: string; direction?: string }): void;
  (event: "update:clip-appearance", appearance: { borderEnabled?: boolean; borderColor?: string; borderWidth?: number; frame?: ClipFrame; frameTitle?: string; frameColor?: string; frameShowMenu?: boolean; frameShowScrollbars?: boolean }): void;
  (event: "update:clip-transform", transform: NormalizedTransform): void;
  (event: "reset:clip-transform"): void;
  (event: "unlink-clip"): void;
  (event: "delete-clip"): void;
  (event: "split-clip"): void;
}>();
</script>

<template>
  <div class="properties-island">
    <div class="panel-header"><h3 class="panel-title">{{ activeTab === 'canvas' ? t('background') : t('properties') }}</h3></div>
    <div class="panel-content">
      <CanvasPanel v-if="activeTab === 'canvas'" :selected-background="selectedBackground" :blur-percent="blurPercent" :background-groups="backgroundGroups" :project-id="projectId" @update:selected-background="emit('update:selectedBackground', $event)" @update:blur-percent="emit('update:blurPercent', $event)" @import:background="emit('import:background', $event)" />
      <AudioClipPropertiesPanel v-else-if="activeTab === 'clip' && normalizedSelectedClip?.kind === 'audio'" :clip="normalizedSelectedClip" @update:volume="emit('update:clip-volume', $event)" @update:enabled="emit('update:clip-enabled', $event)" @delete="emit('delete-clip')" />
      <CaptionClipPanel v-else-if="activeTab === 'clip' && selectedCaptionClip" :clip="selectedCaptionClip" @update="emit('update:caption', $event)" @delete="emit('delete-clip')" />
      <ClipPropertiesPanel v-else-if="activeTab === 'clip'" :selected-clip="normalizedSelectedClip" @update:playback-rate="emit('update:clip-rate', $event)" @update:enabled="emit('update:clip-enabled', $event)" @update:is-mirrored="emit('update:clip-is-mirrored', $event)" @update:corner-radius="emit('update:clip-corner-radius', $event)" @update:shadow="emit('update:clip-shadow', $event)" @update:appearance="emit('update:clip-appearance', $event)" @update:clip-transform="emit('update:clip-transform', $event)" @reset:clip-transform="emit('reset:clip-transform')" @unlink="emit('unlink-clip')" @delete="emit('delete-clip')" @split="emit('split-clip')" />
      <CursorPanel v-else-if="activeTab === 'cursor'" :selected-cursor="selectedCursor" :cursor-size="cursorSize" :cursor-color="cursorColor" :enable-shadow="enableShadow" :shadow-blur="shadowBlur" :shadow-color="shadowColor" :shadow-direction="shadowDirection" :click-effects="clickEffects" @update:selected-cursor="emit('update:selectedCursor', $event)" @update:cursor-size="emit('update:cursorSize', $event)" @update:cursor-color="emit('update:cursorColor', $event)" @update:enable-shadow="emit('update:enableShadow', $event)" @update:shadow-blur="emit('update:shadowBlur', $event)" @update:shadow-color="emit('update:shadowColor', $event)" @update:shadow-direction="emit('update:shadowDirection', $event)" @update:click-effects="emit('update:clickEffects', $event)" />
      <AudioPanel v-else-if="activeTab === 'audio'" :volume="volume" :is-system-audio-enabled="isSystemAudioEnabled" :is-mic-audio-enabled="isMicAudioEnabled" :system-volume="systemVolume" :mic-volume="micVolume" @update:volume="emit('update:volume', $event)" @update:is-system-audio-enabled="emit('update:isSystemAudioEnabled', $event)" @update:is-mic-audio-enabled="emit('update:isMicAudioEnabled', $event)" @update:system-volume="emit('update:systemVolume', $event)" @update:mic-volume="emit('update:micVolume', $event)" />
      <ZoomPanel v-else-if="activeTab === 'zoom'" :selected-zoom="selectedZoom" :can-generate="canGenerateZooms" :has-automatic-zooms="hasAutomaticZooms" @update="emit('update:zoom', $event)" @delete="emit('delete:zoom')" @generate="emit('generate:zooms')" />
      <CaptionPanel v-else-if="activeTab === 'caption'" :composition="composition" :editor-data="editorData" :timeline-duration-ms="timelineDurationMs" @update:composition="emit('update:composition', $event)" @select-caption="emit('select-caption', $event)" />
      <SettingsPanel v-else-if="activeTab === 'settings'" />
    </div>
  </div>
</template>

<style scoped>
.properties-island { width: 400px; background: var(--color-bg-element); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 20px 0 20px 20px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 20px; overflow: hidden; box-sizing: border-box; }.panel-header { padding-bottom: 4px; padding-right: 20px; }.panel-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }.panel-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; padding-right: 14px; box-sizing: border-box; }.panel-content::-webkit-scrollbar { width: 5px; }.panel-content::-webkit-scrollbar-track { background: transparent; }.panel-content::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 3px; }.panel-content::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>
