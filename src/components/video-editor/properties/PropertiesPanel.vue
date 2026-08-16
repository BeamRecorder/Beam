<script setup lang="ts">
import { computed } from 'vue';
import type { CursorType } from '~/components/video-editor/properties/cursor/useCursorReplacer';
import type {
  BackgroundMedia,
  BackgroundValue,
  BackgroundMediaGroup,
} from '~/components/video-editor/composables/backgroundCatalog';
import CursorPanel from '~/components/video-editor/properties/cursor/CursorPanel.vue';
import CanvasPanel from '~/components/video-editor/properties/canvas/CanvasPanel.vue';
import AudioPanel from '~/components/video-editor/properties/audio/AudioPanel.vue';
import ZoomPanel from '~/components/video-editor/properties/zoom/ZoomPanel.vue';
import SettingsPanel from '~/components/video-editor/properties/settings/SettingsPanel.vue';
import ClipPropertiesPanel from '~/components/video-editor/properties/clip/ClipPropertiesPanel.vue';
import AudioClipPropertiesPanel from '~/components/video-editor/properties/clip/AudioClipPropertiesPanel.vue';
import BlurPropertiesPanel from '~/components/video-editor/properties/clip/BlurPropertiesPanel.vue';
import CaptionPanel from '~/components/video-editor/properties/captions/CaptionPanel.vue';
import CaptionClipPanel from '~/components/video-editor/properties/captions/CaptionClipPanel.vue';
import KeyboardCaptionClipPanel from '~/components/video-editor/properties/captions/KeyboardCaptionClipPanel.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Divider from '~/ui/divider/Divider.vue';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { Eye, EyeOff, Trash2 } from '@lucide/vue';
import type { ZoomElement } from '~/components/video-editor/zoom/zoom-types';
import type {
  BlurEffectMode,
  BlurEffectShape,
  CaptionClip,
  ClipComposition,
  ClipFrame,
  NormalizedTransform,
} from '~/media/shared/composition-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import type { ShadowDirection } from './cursor/shadow-types';
import type { CursorClickEffects, CursorMotionSettings } from '../../../api/types/cursor-settings';
import { useTranslate } from '~/i18n/useTranslate';
import { isKeyboardCaptionClip } from '~/media/shared/composition-types';

const { t } = useTranslate('PropertiesPanel');
const { t: tClip } = useTranslate('ClipPropertiesPanel');
const { t: tAudio } = useTranslate('AudioClipPropertiesPanel');
const { t: tCaption } = useTranslate('CaptionClipPanel');
const { t: tZoom } = useTranslate('ZoomPanel');
const { t: tBlur } = useTranslate('BlurPropertiesPanel');
const { t: tSidebar } = useTranslate('SidebarPanel');
const { t: tTimeline } = useTranslate('TimelineTracks');
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
  frameChromeScale?: number;
  clipTransform?: NormalizedTransform;
  isMirrored?: boolean;
  isMirroredY?: boolean;
  volume?: number;
  blurMode?: BlurEffectMode;
  blurShape?: BlurEffectShape;
  blurStrength?: number;
  blurFeather?: number;
  blurCornerRadius?: number;
  blurTintOpacity?: number;
  blurColor?: string;
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
  motion: CursorMotionSettings;
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
const normalizedSelectedClip = computed(() =>
  props.selectedClip
    ? {
        ...props.selectedClip,
        kind: props.selectedClip.kind === 'screen' ? 'video' : props.selectedClip.kind,
      }
    : null,
);
const panelTitle = computed(() => {
  if (props.activeTab === 'clip') {
    const clip = props.selectedClip;
    if (!clip) return tSidebar('clip');
    if (clip.kind === 'screen') return tTimeline('video');
    if (clip.kind === 'webcam') return tTimeline('webcam');
    if (clip.kind === 'blur') return tTimeline('blur');
    return clip.name?.trim() || (clip.kind === 'audio' ? tSidebar('audio') : tSidebar('clip'));
  }

  const titleKey =
    props.activeTab === 'caption'
      ? 'captions'
      : ['canvas', 'zoom', 'cursor', 'audio', 'settings'].includes(props.activeTab)
        ? props.activeTab
        : null;
  return titleKey ? tSidebar(titleKey) : t('properties');
});
const emit = defineEmits<{
  (event: 'update:selectedCursor', value: CursorType): void;
  (event: 'update:cursorSize', value: number): void;
  (event: 'update:cursorColor', value: string): void;
  (event: 'update:enableShadow', value: boolean): void;
  (event: 'update:shadowBlur', value: number): void;
  (event: 'update:shadowColor', value: string): void;
  (event: 'update:shadowDirection', value: ShadowDirection): void;
  (event: 'update:clickEffects', value: CursorClickEffects): void;
  (event: 'update:motion', value: CursorMotionSettings): void;
  (event: 'update:volume', value: number): void;
  (event: 'update:isSystemAudioEnabled', value: boolean): void;
  (event: 'update:isMicAudioEnabled', value: boolean): void;
  (event: 'update:systemVolume', value: number): void;
  (event: 'update:micVolume', value: number): void;
  (event: 'update:selectedBackground', value: BackgroundValue): void;
  (event: 'update:blurPercent', value: number): void;
  (event: 'import:background', value: BackgroundMedia): void;
  (event: 'update:canvas', value: OutputCanvasSettings): void;
  (event: 'update:zoom', value: ZoomElement): void;
  (event: 'delete:zoom'): void;
  (event: 'generate:zooms'): void;
  (event: 'update:caption', value: CaptionClip): void;
  (event: 'update:composition', value: ClipComposition): void;
  (event: 'preview:composition', value: ClipComposition): void;
  (event: 'select-caption', clipId: string): void;
  (event: 'update:clip-rate', rate: number): void;
  (event: 'update:clip-enabled', enabled: boolean): void;
  (event: 'update:clip-volume', volume: number): void;
  (
    event: 'update:blur',
    patch: Partial<{
      mode: BlurEffectMode;
      shape: BlurEffectShape;
      strength: number;
      feather: number;
      cornerRadius: number;
      tintOpacity: number;
      color: string;
    }>,
  ): void;
  (event: 'update:clip-is-mirrored', isMirrored: boolean): void;
  (event: 'update:clip-is-mirrored-y', isMirroredY: boolean): void;
  (event: 'update:clip-corner-radius', radius: string): void;
  (event: 'update:clip-shadow', shadow: { size: string; color?: string; direction?: string }): void;
  (
    event: 'update:clip-appearance',
    appearance: {
      borderEnabled?: boolean;
      borderColor?: string;
      borderWidth?: number;
      frame?: ClipFrame;
      frameTitle?: string;
      frameColor?: string;
      frameShowMenu?: boolean;
      frameShowScrollbars?: boolean;
      frameChromeScale?: number;
    },
  ): void;
  (event: 'update:clip-transform', transform: NormalizedTransform): void;
  (event: 'reset:clip-transform'): void;
  (event: 'unlink-clip'): void;
  (event: 'delete-clip'): void;
  (event: 'split-clip'): void;
  (event: 'back-to-hud'): void;
  (event: 'start-recording', config: any): void;
}>();

const isCurrentClipEnabled = computed(() => {
  if (props.selectedClip) return props.selectedClip.enabled ?? true;
  if (props.selectedCaptionClip) return props.selectedCaptionClip.enabled ?? true;
  return true;
});

const isDeletable = computed(() => {
  if (props.activeTab === 'zoom' && props.selectedZoom) return true;
  if (props.activeTab === 'clip' && (props.selectedClip || props.selectedCaptionClip)) return true;
  return false;
});

const isToggleable = computed(() => {
  return props.activeTab === 'clip' && Boolean(props.selectedClip || props.selectedCaptionClip);
});

const deleteTooltip = computed(() => {
  if (props.activeTab === 'zoom') {
    return tZoom('deleteZoom') || 'Delete zoom';
  }
  if (props.selectedCaptionClip) {
    return tCaption('deleteCaptionClip') || 'Delete caption';
  }
  if (props.selectedClip) {
    if (props.selectedClip.kind === 'audio') {
      return tAudio('deleteAudioClip') || 'Delete audio';
    }
    if (props.selectedClip.kind === 'blur') {
      return tBlur('delete') ? `${tBlur('delete')} (${panelTitle.value.toLowerCase()})` : 'Delete blur';
    }
    if (props.selectedClip.kind === 'screen' || props.selectedClip.kind === 'video') {
      return tClip('deleteVideo') || tClip('deleteClip') || 'Delete video';
    }
    if (props.selectedClip.kind === 'webcam') {
      return tClip('deleteWebcam') || tClip('deleteClip') || 'Delete webcam';
    }
  }
  return tClip('deleteClip') || 'Delete clip';
});

const handleToggleClipEnabled = () => {
  const nextValue = !isCurrentClipEnabled.value;
  if (props.selectedClip) {
    emit('update:clip-enabled', nextValue);
  } else if (props.selectedCaptionClip) {
    emit('update:caption', { ...props.selectedCaptionClip, enabled: nextValue });
  }
};

const handleDelete = () => {
  if (props.activeTab === 'zoom') {
    emit('delete:zoom');
  } else {
    emit('delete-clip');
  }
};
</script>

<template>
  <div class="properties-island">
    <div class="panel-header">
      <h3 class="panel-title">{{ panelTitle }}</h3>
      <div v-if="isDeletable" class="panel-header-actions">
        <ButtonGroup size="xs">
          <Button
            v-if="isToggleable"
            variant="ghost"
            size="xs"
            :icon="isCurrentClipEnabled ? Eye : EyeOff"
            icon-only
            :tooltip="isCurrentClipEnabled ? (tClip('enabled') || 'Enabled') : (tClip('disabled') || 'Disabled')"
            :aria-label="isCurrentClipEnabled ? 'Hide clip' : 'Show clip'"
            :class="{ 'is-muted-clip': !isCurrentClipEnabled }"
            @click="handleToggleClipEnabled"
          />
          <Divider v-if="isToggleable" orientation="vertical" spacing="none" />
          <Button
            variant="ghost"
            size="xs"
            :icon="Trash2"
            icon-only
            :tooltip="deleteTooltip"
            :aria-label="deleteTooltip"
            class="panel-delete-btn"
            @click="handleDelete"
          />
        </ButtonGroup>
      </div>
    </div>
    <ScrollShadow class="panel-scroll-shadow">
      <div class="panel-body">
        <CanvasPanel
          v-if="activeTab === 'canvas'"
          :selected-background="selectedBackground"
          :blur-percent="blurPercent"
          :background-groups="backgroundGroups"
          :project-id="projectId"
          @update:selected-background="emit('update:selectedBackground', $event)"
          @update:blur-percent="emit('update:blurPercent', $event)"
          @import:background="emit('import:background', $event)"
        />
        <AudioClipPropertiesPanel
          v-else-if="activeTab === 'clip' && normalizedSelectedClip?.kind === 'audio'"
          :clip="normalizedSelectedClip"
          @update:volume="emit('update:clip-volume', $event)"
          @delete="emit('delete-clip')"
        />
        <BlurPropertiesPanel
          v-else-if="activeTab === 'clip' && normalizedSelectedClip?.kind === 'blur'"
          :clip="{
            mode: normalizedSelectedClip.blurMode ?? 'blur',
            shape: normalizedSelectedClip.blurShape ?? 'rectangle',
            strength: normalizedSelectedClip.blurStrength ?? 60,
            feather: normalizedSelectedClip.blurFeather ?? 0,
            cornerRadius: normalizedSelectedClip.blurCornerRadius ?? 0,
            tintOpacity: normalizedSelectedClip.blurTintOpacity ?? 0,
            color: normalizedSelectedClip.blurColor ?? '#000000',
          }"
          @update="emit('update:blur', $event)"
          @delete="emit('delete-clip')"
        />
        <KeyboardCaptionClipPanel
          v-else-if="activeTab === 'clip' && selectedCaptionClip && isKeyboardCaptionClip(selectedCaptionClip)"
          :clip="selectedCaptionClip"
          @update="emit('update:caption', $event)"
          @delete="emit('delete-clip')"
        />
        <CaptionClipPanel
          v-else-if="activeTab === 'clip' && selectedCaptionClip"
          :clip="selectedCaptionClip"
          @update="emit('update:caption', $event)"
          @delete="emit('delete-clip')"
        />
        <ClipPropertiesPanel
          v-else-if="activeTab === 'clip'"
          :selected-clip="normalizedSelectedClip"
          @update:playback-rate="emit('update:clip-rate', $event)"
          @update:is-mirrored="emit('update:clip-is-mirrored', $event)"
          @update:is-mirrored-y="emit('update:clip-is-mirrored-y', $event)"
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
          :selected-cursor="selectedCursor"
          :cursor-size="cursorSize"
          :cursor-color="cursorColor"
          :enable-shadow="enableShadow"
          :shadow-blur="shadowBlur"
          :shadow-color="shadowColor"
          :shadow-direction="shadowDirection"
          :click-effects="clickEffects"
          :motion="motion"
          @update:selected-cursor="emit('update:selectedCursor', $event)"
          @update:cursor-size="emit('update:cursorSize', $event)"
          @update:cursor-color="emit('update:cursorColor', $event)"
          @update:enable-shadow="emit('update:enableShadow', $event)"
          @update:shadow-blur="emit('update:shadowBlur', $event)"
          @update:shadow-color="emit('update:shadowColor', $event)"
          @update:shadow-direction="emit('update:shadowDirection', $event)"
          @update:click-effects="emit('update:clickEffects', $event)"
          @update:motion="emit('update:motion', $event)"
        />
        <AudioPanel
          v-else-if="activeTab === 'audio'"
          :volume="volume"
          :is-system-audio-enabled="isSystemAudioEnabled"
          :is-mic-audio-enabled="isMicAudioEnabled"
          :system-volume="systemVolume"
          :mic-volume="micVolume"
          @update:volume="emit('update:volume', $event)"
          @update:is-system-audio-enabled="emit('update:isSystemAudioEnabled', $event)"
          @update:is-mic-audio-enabled="emit('update:isMicAudioEnabled', $event)"
          @update:system-volume="emit('update:systemVolume', $event)"
          @update:mic-volume="emit('update:micVolume', $event)"
        />
        <ZoomPanel
          v-else-if="activeTab === 'zoom'"
          :selected-zoom="selectedZoom"
          :can-generate="canGenerateZooms"
          :has-automatic-zooms="hasAutomaticZooms"
          @update="emit('update:zoom', $event)"
          @delete="emit('delete:zoom')"
          @generate="emit('generate:zooms')"
        />
        <SettingsPanel
          v-else-if="activeTab === 'settings'"
          @back-to-hud="emit('back-to-hud')"
          @start-recording="emit('start-recording', $event)"
        />
        <CaptionPanel
          v-show="activeTab === 'caption'"
          :composition="composition"
          :editor-data="editorData"
          :timeline-duration-ms="timelineDurationMs"
          @update:composition="emit('update:composition', $event)"
          @preview:composition="emit('preview:composition', $event)"
          @select-caption="emit('select-caption', $event)"
        />
      </div>
    </ScrollShadow>
  </div>
</template>

<style scoped>
.properties-island {
  width: 400px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 0;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  min-height: 56px;
  max-height: 56px;
  padding: 0 20px;
  box-sizing: border-box;
  flex-shrink: 0;
}
.panel-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.panel-delete-btn:hover {
  color: var(--color-error) !important;
  background: var(--color-error-light) !important;
}
.is-muted-clip {
  color: var(--text-muted) !important;
  opacity: 0.6;
}
.panel-scroll-shadow {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.panel-body {
  display: flex;
  flex-direction: column;
  padding: 0 20px 24px 20px;
  box-sizing: border-box;
  width: 100%;
  flex: 1;
  min-height: 100%;
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
