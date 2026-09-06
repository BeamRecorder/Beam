<script setup lang="ts">
import RecordingSidecarLinks from './clip/RecordingSidecarLinks.vue';
import PropertiesLockGuard from './PropertiesLockGuard.vue';
import type { PropertiesPanelProps, PropertiesPanelEmits } from './properties-panel-contract-types';
import { computed, ref } from 'vue';
import CursorPanel from '~/components/video-editor/properties/cursor/CursorPanel.vue';
import CanvasPanel from '~/components/video-editor/properties/canvas/CanvasPanel.vue';
import AudioPanel from '~/components/video-editor/properties/audio/AudioPanel.vue';
import ZoomPanel from '~/components/video-editor/properties/zoom/ZoomPanel.vue';
import SettingsPanel from '~/components/video-editor/properties/settings/SettingsPanel.vue';
import ClipPropertiesPanel from '~/components/video-editor/properties/clip/ClipPropertiesPanel.vue';
import AudioClipPropertiesPanel from '~/components/video-editor/properties/clip/AudioClipPropertiesPanel.vue';
import BlurPropertiesPanel from '~/components/video-editor/properties/clip/BlurPropertiesPanel.vue';
import GeneratedLayerPropertiesPanel from '~/components/video-editor/properties/clip/GeneratedLayerPropertiesPanel.vue';
import CaptionPanel from '~/components/video-editor/properties/captions/CaptionPanel.vue';
import CaptionClipPanel from '~/components/video-editor/properties/captions/CaptionClipPanel.vue';
import KeyboardCaptionClipPanel from '~/components/video-editor/properties/captions/KeyboardCaptionClipPanel.vue';
import ClipTransitionsPanel from '~/components/video-editor/properties/clip/ClipTransitionsPanel.vue';
import TransitionSettingsPanel from '~/components/video-editor/properties/clip/TransitionSettingsPanel.vue';
import PropertiesPanelHeader from './PropertiesPanelHeader.vue';
import { setClipTransition } from '../composition/engine/clip-engine';
import { EMPTY_CLIP_TRANSITIONS, normalizeCanvasTransitions } from '~/media/shared/clip-transitions';
import ScrollShadow from '~/ui/scroll-shadow/ScrollShadow.vue';
import { DEFAULT_ZOOM_AUTO_FOLLOW, DEFAULT_ZOOM_MOTION_BLUR } from '~/components/video-editor/zoom/zoom-types';
import type { CaptionClip, ClipKind, ClipTransition } from '~/media/shared/composition-types';
import { useTranslate } from '~/i18n/useTranslate';
import { isAudioClip, isColorClip, isKeyboardCaptionClip, isShapeClip } from '~/media/shared/composition-types';
import { usePropertiesPanelNavigation } from './usePropertiesPanelNavigation';
import { selectedClipNames } from './clip-selection-names';
import { clipTransitionPanelTitle, propertiesPanelTitle } from './properties-panel-title';
import { applyCaptionSelectionUpdate } from '../composition/caption-selection';
const { t } = useTranslate('PropertiesPanel');
const { t: tClip } = useTranslate('ClipPropertiesPanel');
const { t: tCaption } = useTranslate('CaptionClipPanel');
const { t: tZoom } = useTranslate('ZoomPanel');
const { t: tBlur } = useTranslate('BlurPropertiesPanel');
const { t: tSidebar } = useTranslate('SidebarPanel');
const { t: tTimeline } = useTranslate('TimelineTracks');
const { t: tTimelineToolbar } = useTranslate('TimelineToolbar');
const { t: tTransitions } = useTranslate('TransitionsPanel');
const { t: tAudioClip } = useTranslate('AudioClipPropertiesPanel');
const { t: tCanvas } = useTranslate('CanvasPanel');
const props = withDefaults(defineProps<PropertiesPanelProps>(), {
  hasSystemAudio: false,
  hasMicAudio: false,
  selectedClipIds: () => [],
  selectedZoomIds: () => [],
  audioNormalizationStatuses: () => ({}),
  audioNormalizationErrors: () => ({}),
  zoomAutoFollow: () => ({ ...DEFAULT_ZOOM_AUTO_FOLLOW }),
  zoomMotionBlur: () => ({ ...DEFAULT_ZOOM_MOTION_BLUR }),
});
const normalizedSelectedClip = computed(() =>
  props.selectedClip
    ? {
        ...props.selectedClip,
        kind: props.selectedClip.kind === 'screen' ? 'video' : props.selectedClip.kind,
      }
    : null,
);
const selectedDomainClip = computed(() => {
  const id = props.selectedClip?.id ?? props.selectedCaptionClip?.id;
  return id ? (props.composition.clips.find((clip) => clip.id === id) ?? null) : null;
});
const selectedDomainClips = computed(() => {
  const ids = new Set(
    props.selectedClipIds?.length
      ? props.selectedClipIds
      : selectedDomainClip.value
        ? [selectedDomainClip.value.id]
        : [],
  );
  return props.composition.clips.filter((clip) => ids.has(clip.id));
});
const audioClips = computed(() => props.composition.clips.filter(isAudioClip));
const normalizableAudioClips = computed(() => {
  const assetIds = new Set(props.composition.assets.filter((asset) => asset.kind === 'audio').map((asset) => asset.id));
  return audioClips.value.filter((clip) => assetIds.has(clip.assetId));
});
const normalizeAllAudioEnabled = computed(
  () =>
    normalizableAudioClips.value.length > 0 &&
    normalizableAudioClips.value.every((clip) => clip.normalization?.enabled === true),
);
const normalizeAllAudioPending = computed(() =>
  normalizableAudioClips.value.some((clip) => props.audioNormalizationStatuses[clip.id] === 'analyzing'),
);
const selectionClipNames = computed(() => selectedClipNames(selectedDomainClips.value, tTimeline('holdSegment')));
const selectionNames = computed(() =>
  props.activeTab === 'zoom'
    ? props.selectedZoomIds.length > 1
      ? [`${props.selectedZoomIds.length} ${tTimeline('zooms')}`]
      : []
    : selectionClipNames.value,
);
const editLocked = computed(() =>
  Boolean(props.lockedSelection?.clipIds.length || props.lockedSelection?.zoomIds.length),
);
const lockedSelectionName = computed(() => {
  const ids = new Set(props.lockedSelection?.clipIds ?? []);
  const names = selectedClipNames(
    props.composition.clips.filter((clip) => ids.has(clip.id) && clip.locked),
    tTimeline('holdSegment'),
  );
  const zoomCount = props.lockedSelection?.zoomIds.length ?? 0;
  if (zoomCount) names.push(zoomCount === 1 ? tTimelineToolbar('zoom') : `${zoomCount} ${tTimeline('zooms')}`);
  return names.join(', ');
});
const panelHeader = ref<InstanceType<typeof PropertiesPanelHeader> | null>(null);
const transitionEdge = ref<'entry' | 'exit'>('entry');
const { transitionsOpen, navigationDirection, openTransitions, closeTransitions } = usePropertiesPanelNavigation({
  contextKey: () => `${props.activeTab}:${props.selectedClip?.id ?? ''}:${props.selectedCaptionClip?.id ?? ''}`,
  canOpenTransitions: () => props.activeTab === 'canvas' || Boolean(selectedDomainClip.value),
});
const panelTransitionName = computed(() => `properties-panel-${navigationDirection.value}`);
const openTransitionEdge = (edge: 'entry' | 'exit' = 'entry') => {
  transitionEdge.value = edge;
  return openTransitions();
};
const updateTransition = (edge: 'entry' | 'exit', value: ClipTransition | null) => {
  if (!selectedDomainClip.value) return;
  let next = props.composition;
  for (const clip of selectedDomainClips.value) next = setClipTransition(next, clip.id, edge, value);
  emit('update:composition', next);
};
const updateCanvasTransition = (edge: 'entry' | 'exit', value: ClipTransition | null) => {
  const transitions = normalizeCanvasTransitions(
    { ...(props.canvas.transitions ?? EMPTY_CLIP_TRANSITIONS), [edge]: value },
    props.timelineDurationMs,
  );
  emit('update:canvas', { ...props.canvas, transitions });
};
const transitionPanelTitle = computed(() => {
  if (props.activeTab === 'canvas') return tTransitions('canvasTransitions');
  return clipTransitionPanelTitle(selectedDomainClip.value?.kind, () => tTransitions('clipTransitions'));
});
const panelTitle = computed(() =>
  propertiesPanelTitle(
    props.activeTab,
    (selectedDomainClip.value?.kind ??
      props.selectedClip?.kind ??
      props.selectedCaptionClip?.kind ??
      null) as ClipKind | null,
    { t, tSidebar, tTimeline, tTimelineToolbar, tCanvas },
  ),
);
const emit = defineEmits<PropertiesPanelEmits>();
const previewCaption = (clip: CaptionClip | null) => {
  if (!clip) return emit('preview:composition', null);
  if (!props.selectedCaptionClip) return;
  emit('preview:composition', applyCaptionSelectionUpdate(props.composition, props.selectedClipIds ?? [], clip));
};
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
      return tAudioClip('deleteAudioClip') || 'Delete audio clip';
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

const handleToggleClipEnabled = () => emit('update:clip-enabled', !isCurrentClipEnabled.value);
const handleDelete = () => (props.activeTab === 'zoom' ? emit('delete:zoom') : emit('delete-clip'));
defineExpose({ openCanvasTransitions: openTransitionEdge });
</script>
<template>
  <div class="properties-island">
    <div class="properties-scale-content">
      <PropertiesPanelHeader
        ref="panelHeader"
        :title="panelTitle"
        :selection-names="selectionNames"
        :transition-title="transitionPanelTitle"
        :transition-name="panelTransitionName"
        :transitions-open="transitionsOpen"
        :show-clip-actions="isDeletable && !editLocked"
        :clip-transitionable="activeTab === 'clip'"
        :show-canvas-transition="activeTab === 'canvas'"
        :enabled="isCurrentClipEnabled"
        :toggleable="isToggleable"
        :enabled-label="tClip('enabled') || 'Enabled'"
        :disabled-label="tClip('disabled') || 'Disabled'"
        :delete-label="deleteTooltip"
        :transition-button-label="
          activeTab === 'canvas' ? tTransitions('canvasTransitions') : tTransitions('clipTransitions')
        "
        @back="closeTransitions"
        @toggle="handleToggleClipEnabled"
        @delete="handleDelete"
        @transition="openTransitionEdge()"
        @after-enter="!transitionsOpen && panelHeader?.focusTransitionButton()"
      />
      <PropertiesLockGuard
        :locked="Boolean(editLocked && !['canvas', 'settings', 'cursor'].includes(activeTab))"
        :name="lockedSelectionName"
        @unlock="emit('unlock:selection')"
      >
        <ScrollShadow class="panel-scroll-shadow">
          <Transition :name="panelTransitionName" mode="out-in">
            <div
              :key="transitionsOpen ? 'transitions' : 'properties'"
              class="panel-body"
              :inert="editLocked && activeTab !== 'canvas' && activeTab !== 'settings' && activeTab !== 'cursor'"
            >
              <TransitionSettingsPanel
                v-if="transitionsOpen && activeTab === 'canvas'"
                :transitions="canvas.transitions ?? EMPTY_CLIP_TRANSITIONS"
                :timeline-duration-ms="timelineDurationMs"
                :initial-edge="transitionEdge"
                @update="updateCanvasTransition"
              />
              <ClipTransitionsPanel
                v-else-if="transitionsOpen && selectedDomainClip"
                :clip="selectedDomainClip"
                :initial-edge="transitionEdge"
                @update="updateTransition"
              />
              <CanvasPanel
                v-else-if="activeTab === 'canvas'"
                :selected-background="selectedBackground"
                :blur-percent="blurPercent"
                :show-background="canvas.showBackground"
                :watermark="canvas.watermark"
                :background-groups="backgroundGroups"
                :project-id="projectId"
                @update:selected-background="emit('update:selectedBackground', $event)"
                @update:blur-percent="emit('update:blurPercent', $event)"
                @update:show-background="emit('update:canvas', { ...canvas, showBackground: $event })"
                @update:watermark="emit('update:canvas', { ...canvas, watermark: $event })"
                @import:background="emit('import:background', $event)"
              />
              <AudioClipPropertiesPanel
                v-else-if="activeTab === 'clip' && normalizedSelectedClip?.kind === 'audio'"
                :clip="normalizedSelectedClip"
                :normalization-status="
                  selectedDomainClip ? audioNormalizationStatuses[selectedDomainClip.id] : undefined
                "
                :normalization-error="selectedDomainClip ? audioNormalizationErrors[selectedDomainClip.id] : undefined"
                @update:volume="emit('update:clip-volume', $event)"
                @normalize="
                  emit(
                    'normalize:audio',
                    selectedDomainClips.map((clip) => clip.id),
                  )
                "
                @reset-normalization="
                  emit(
                    'reset:audio-normalization',
                    selectedDomainClips.map((clip) => clip.id),
                  )
                "
              />
              <GeneratedLayerPropertiesPanel
                v-else-if="
                  activeTab === 'clip' &&
                  selectedDomainClip &&
                  (isColorClip(selectedDomainClip) || isShapeClip(selectedDomainClip))
                "
                :composition="composition"
                :clip="selectedDomainClip"
                @update="emit('update:composition', $event)"
                @corner-radius-interaction="emit('corner-radius-interaction', $event)"
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
                @preview="previewCaption"
                @delete="emit('delete-clip')"
              />
              <CaptionClipPanel
                v-else-if="activeTab === 'clip' && selectedCaptionClip"
                :clip="selectedCaptionClip"
                @update="emit('update:caption', $event)"
                @preview="previewCaption"
                @delete="emit('delete-clip')"
              />
              <ClipPropertiesPanel
                v-else-if="activeTab === 'clip'"
                :selected-clip="normalizedSelectedClip"
                @update:playback-rate="emit('update:clip-rate', $event)"
                @update:is-mirrored="emit('update:clip-is-mirrored', $event)"
                @update:is-mirrored-y="emit('update:clip-is-mirrored-y', $event)"
                @update:corner-radius="emit('update:clip-corner-radius', $event)"
                @corner-radius-interaction="emit('corner-radius-interaction', $event)"
                @update:shadow="emit('update:clip-shadow', $event)"
                @update:appearance="emit('update:clip-appearance', $event)"
                @update:crop="emit('update:clip-crop', $event)"
                @preview:crop="emit('preview:clip-crop', $event)"
                @update:clip-transform="emit('update:clip-transform', $event)"
                @update:camera-layout="emit('update:camera-layout', $event)"
                @update:camera-framing="emit('update:camera-framing', $event)"
                @update:camera-split-ratio="emit('update:camera-split-ratio', $event)"
                @update:camera-split-padding="emit('update:camera-split-padding', $event)"
                @update:react-to-zoom="emit('update:webcam-react-to-zoom', $event)"
                @reset:clip-transform="emit('reset:clip-transform')"
                @delete="emit('delete-clip')"
                @split="emit('split-clip')"
              >
                <template #sidecars>
                  <RecordingSidecarLinks
                    v-if="selectedClipIds.length === 1"
                    :clip-id="normalizedSelectedClip?.id"
                    :composition="composition"
                    :zooms="zoomElements ?? []"
                    @unlink="emit('unlink-sidecars', $event)"
                  />
                </template>
              </ClipPropertiesPanel>
              <CursorPanel
                v-else-if="activeTab === 'cursor'"
                :selection="cursorSelection"
                :packs="cursorPacks"
                :cursor-size="cursorSize"
                :cursor-color="cursorColor"
                :enable-shadow="enableShadow"
                :shadow-blur="shadowBlur"
                :shadow-color="shadowColor"
                :shadow-direction="shadowDirection"
                :click-effects="clickEffects"
                :motion="motion"
                :auto-hide="autoHide"
                @update:selection="emit('update:cursorSelection', $event)"
                @preview:selection="emit('preview:cursorSelection', $event)"
                @update:cursor-size="emit('update:cursorSize', $event)"
                @update:cursor-color="emit('update:cursorColor', $event)"
                @update:enable-shadow="emit('update:enableShadow', $event)"
                @update:shadow-blur="emit('update:shadowBlur', $event)"
                @update:shadow-color="emit('update:shadowColor', $event)"
                @update:shadow-direction="emit('update:shadowDirection', $event)"
                @update:click-effects="emit('update:clickEffects', $event)"
                @update:motion="emit('update:motion', $event)"
                @update:auto-hide="emit('update:autoHide', $event)"
              />
              <AudioPanel
                v-else-if="activeTab === 'audio'"
                :volume="volume"
                :is-system-audio-enabled="isSystemAudioEnabled"
                :is-mic-audio-enabled="isMicAudioEnabled"
                :has-system-audio="hasSystemAudio"
                :has-mic-audio="hasMicAudio"
                :has-audio="normalizableAudioClips.length > 0"
                :normalize-all-enabled="normalizeAllAudioEnabled"
                :normalize-all-pending="normalizeAllAudioPending"
                :system-volume="systemVolume"
                :mic-volume="micVolume"
                @update:volume="emit('update:volume', $event)"
                @update:is-system-audio-enabled="emit('update:isSystemAudioEnabled', $event)"
                @update:is-mic-audio-enabled="emit('update:isMicAudioEnabled', $event)"
                @update:system-volume="emit('update:systemVolume', $event)"
                @update:mic-volume="emit('update:micVolume', $event)"
                @delete:system="emit('delete:system-audio')"
                @delete:microphone="emit('delete:mic-audio')"
                @update:normalize-all="
                  $event
                    ? emit(
                        'normalize:audio',
                        normalizableAudioClips.map((clip) => clip.id),
                      )
                    : emit(
                        'reset:audio-normalization',
                        normalizableAudioClips.map((clip) => clip.id),
                      )
                "
              />
              <ZoomPanel
                v-else-if="activeTab === 'zoom'"
                :selected-zoom="selectedZoom"
                :can-generate="canGenerateZooms"
                :has-automatic-zooms="hasAutomaticZooms"
                :motion-blur="zoomMotionBlur"
                :auto-follow="zoomAutoFollow"
                @update="emit('update:zoom', $event)"
                @update:motion-blur="emit('update:zoomMotionBlur', $event)"
                @update:auto-follow="emit('update:zoomAutoFollow', $event)"
                @delete="emit('delete:zoom')"
                @generate="emit('generate:zooms')"
              />
              <SettingsPanel v-else-if="activeTab === 'settings'" />
              <CaptionPanel
                v-show="activeTab === 'caption'"
                :composition="composition"
                :editor-data="editorData"
                :timeline-duration-ms="timelineDurationMs"
                @update:composition="emit('update:composition', $event)"
                @select-caption="emit('select-caption', $event)"
              />
            </div>
          </Transition>
        </ScrollShadow>
      </PropertiesLockGuard>
    </div>
  </div>
</template>
<style scoped src="./PropertiesPanel.css"></style>
