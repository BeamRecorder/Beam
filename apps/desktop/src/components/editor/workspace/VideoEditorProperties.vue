<script setup lang="ts">
import PropertiesPanel from '~/components/editor/properties/PropertiesPanel.vue';
import { useEditorWorkspaceContext } from './workspace-context';
import { toRefs } from 'vue';
const workspace = useEditorWorkspaceContext();
const {
  activeTab,
  systemVolume,
  micVolume,
  cursorMotion,
  zoomState,
  outputCanvas,
  duration,
  volume,
  selectedBackground,
  backgroundBlurPercent,
  backgroundGroups,
  addBackground,
  cursorSelection,
  cursorPacks,
  cursorSize,
  cursorColor,
  enableShadow,
  shadowBlur,
  shadowColor,
  shadowDirection,
  clickEffects,
  cursorAutoHide,
  composition,
  selectedClipId,
  selectedClipIds,
  selectedClipInfo,
  selectedCaptionClip,
  isSystemAudioEnabled,
  isMicAudioEnabled,
  hasSystemAudio,
  hasMicAudio,
  splitSelectedClip,
  updateSelectedAppearance,
  updateSelectedBlur,
  updateSelectedCameraLayout,
  updateSelectedCameraFraming,
  updateSelectedCameraSplitRatio,
  updateSelectedCameraSplitPadding,
  updateSelectedWebcamReactToZoom,
  updateSelectedMirrored,
  updateSelectedMirroredY,
  updateSelectedRate,
  updateSelectedVolume,
  updateSelectedEnabled,
  zoomElements,
  selectedZoomIds,
  selectedZoom,
  canGenerateZooms,
  hasAutomaticZooms,
  generateZooms,
  updateZoom,
  zoomMotionBlur,
  zoomAutoFollow,
  cursorPreview,
  transformHandlesMuted,
  cropPreview,
  previewCrop,
  renderedOutputCanvas,
  lockedSelection,
  emit,
  audioNormalization,
  isPropertiesPanelOpen,
  selectEditorClip,
  replaceComposition,
  previewComposition,
  commitCaption,
  requestClipDeletion,
  deleteAudioRole,
  unlinkSidecars,
  lockTimelineSelection,
  deleteSelectedTimelineZooms,
  commitSelectedTransform,
  commitSelectedCrop,
} = workspace;
const { project, editorData } = toRefs(workspace.props);
</script>
<template>
  <PropertiesPanel
    v-if="isPropertiesPanelOpen"
    :locked-selection="lockedSelection"
    @unlock:selection="lockTimelineSelection({ ...lockedSelection, locked: false })"
    :ref="workspace.propertiesPanelRef"
    :active-tab="activeTab"
    :selected-clip="selectedClipInfo && cropPreview ? { ...selectedClipInfo, crop: cropPreview } : selectedClipInfo"
    :selected-caption-clip="selectedCaptionClip"
    :selected-clip-ids="selectedClipIds"
    :selected-zoom-ids="selectedZoomIds"
    v-model:cursor-selection="cursorSelection"
    :cursor-packs="cursorPacks"
    @preview:cursor-selection="cursorPreview = $event"
    v-model:cursor-size="cursorSize"
    v-model:cursor-color="cursorColor"
    v-model:enable-shadow="enableShadow"
    v-model:shadow-blur="shadowBlur"
    v-model:shadow-color="shadowColor"
    v-model:shadow-direction="shadowDirection"
    v-model:click-effects="clickEffects"
    v-model:motion="cursorMotion"
    v-model:auto-hide="cursorAutoHide"
    v-model:volume="volume"
    v-model:system-volume="systemVolume"
    v-model:mic-volume="micVolume"
    v-model:is-system-audio-enabled="isSystemAudioEnabled"
    v-model:is-mic-audio-enabled="isMicAudioEnabled"
    :has-system-audio="hasSystemAudio"
    :has-mic-audio="hasMicAudio"
    :selected-background="selectedBackground"
    :blur-percent="backgroundBlurPercent"
    :background-groups="backgroundGroups"
    :selected-zoom="selectedZoom"
    :zoom-elements="zoomElements"
    :can-generate-zooms="canGenerateZooms"
    :has-automatic-zooms="hasAutomaticZooms"
    :zoom-motion-blur="zoomMotionBlur"
    :zoom-auto-follow="zoomAutoFollow"
    :composition="composition"
    :editor-data="editorData"
    :timeline-duration-ms="Math.round(duration * 1000)"
    :project-id="project?.id"
    :canvas="renderedOutputCanvas"
    :audio-normalization-statuses="audioNormalization.statuses"
    :audio-normalization-errors="audioNormalization.errors"
    @import:background="addBackground($event)"
    @update:selected-background="selectedBackground = $event"
    @update:blur-percent="backgroundBlurPercent = $event"
    @update:canvas="outputCanvas = $event"
    @update:zoom="updateZoom"
    @update:zoom-motion-blur="zoomState.updateZoomMotionBlur"
    @update:zoom-auto-follow="zoomState.updateZoomAutoFollow"
    @delete:zoom="deleteSelectedTimelineZooms"
    @generate:zooms="generateZooms()"
    @update:caption="commitCaption"
    @update:composition="replaceComposition"
    @preview:composition="previewComposition"
    @select-caption="selectEditorClip"
    @delete-clip="
      requestClipDeletion(selectedClipIds.length ? selectedClipIds : selectedClipId ? [selectedClipId] : [])
    "
    @delete:system-audio="deleteAudioRole('system')"
    @delete:mic-audio="deleteAudioRole('microphone')"
    @normalize:audio="audioNormalization.normalizeClipIds($event)"
    @reset:audio-normalization="audioNormalization.resetClipIds($event)"
    @split-clip="splitSelectedClip"
    @update:clip-rate="updateSelectedRate"
    @update:clip-volume="updateSelectedVolume"
    @update:blur="updateSelectedBlur"
    @update:clip-enabled="updateSelectedEnabled"
    @unlink-sidecars="unlinkSidecars"
    @update:clip-is-mirrored="updateSelectedMirrored"
    @update:clip-is-mirrored-y="updateSelectedMirroredY"
    @update:clip-corner-radius="
      updateSelectedAppearance({
        cornerRadius: ['none', 'sm', 'md', 'lg', 'full'].includes($event)
          ? ($event as 'none' | 'sm' | 'md' | 'lg' | 'full')
          : Number($event),
      })
    "
    @corner-radius-interaction="transformHandlesMuted = $event"
    @update:clip-shadow="
      updateSelectedAppearance({
        shadowSize: $event.size as 'none' | 'sm' | 'md' | 'lg' | 'custom',
        shadowBlur: Number($event.blur ?? 40),
        shadowMode: ($event.mode ?? 'solid') as 'solid' | 'adaptive',
        shadowColor: $event.color ?? '#000000',
        shadowDirection: ($event.direction ?? 'bottom') as 'all' | 'bottom' | 'bottom-right' | 'top-left',
      })
    "
    @update:clip-appearance="updateSelectedAppearance($event)"
    @update:clip-crop="commitSelectedCrop"
    @preview:clip-crop="previewCrop"
    @update:clip-transform="commitSelectedTransform"
    @update:camera-layout="updateSelectedCameraLayout"
    @update:camera-framing="updateSelectedCameraFraming"
    @update:camera-split-ratio="updateSelectedCameraSplitRatio"
    @update:camera-split-padding="updateSelectedCameraSplitPadding"
    @update:webcam-react-to-zoom="updateSelectedWebcamReactToZoom"
    @reset:clip-transform="commitSelectedTransform({ x: 0, y: 0, width: 1, height: 1 })"
    @back-to-hud="emit('back-to-hud')"
  />
</template>
