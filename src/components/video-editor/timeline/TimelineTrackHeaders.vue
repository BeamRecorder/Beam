<script setup lang="ts">
import {
  Camera,
  CircleDashed,
  GripVertical,
  Image as ImageIcon,
  Keyboard,
  Mic,
  MousePointer,
  Type,
  Video,
  Volume2,
} from '@lucide/vue';
import type { AudioClip, CaptionClip, Clip, VisualClip, BlurClip } from '~/media/shared/composition-types';
import type { ImportedAudioTimelineTrack } from './composables/audio-timeline-tracks';
import type { VisualTimelineTrack } from './composables/timeline-tracks-types';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{
  visualTracks: VisualTimelineTrack[];
  keyboardCaptionClips: CaptionClip[];
  textCaptionClips: CaptionClip[];
  systemAudioClips: AudioClip[];
  microphoneClips: AudioClip[];
  importedAudioTracks: ImportedAudioTimelineTrack[];
  includeAudioInExport: boolean;
  draggedTrackId: string | null;
  selectTrack: (clips: Clip[], trackName: string, event?: MouseEvent) => void;
  beginReorder: (event: PointerEvent, trackId: string, clipId: string) => void;
  openTrackContextMenu: (event: MouseEvent, kind: 'visual' | 'zoom' | 'caption' | 'audio', id?: string) => void;
}>();
const { t } = useTranslate('TimelineTracks');
const iconForVisual = (clip: VisualClip | BlurClip) =>
  clip.kind === 'blur' ? CircleDashed : clip.kind === 'image' ? ImageIcon : clip.kind === 'webcam' ? Camera : Video;
const labelForVisual = (clip: VisualClip | BlurClip) =>
  clip.kind === 'blur'
    ? t('blur')
    : clip.kind === 'screen'
      ? t('video')
      : clip.kind === 'webcam'
        ? t('webcam')
        : clip.name;
</script>

<template>
  <TransitionGroup name="track-reorder" tag="div" class="visual-tracks-group">
    <div
      v-for="track in visualTracks"
      :key="track.id"
      class="sidebar-track-item visual-track"
      :data-track-id="track.id"
      :class="{ disabled: !track.clips.some((clip) => clip.enabled), dragging: draggedTrackId === track.id }"
      @contextmenu="openTrackContextMenu($event, 'visual', track.id)"
    >
      <button
        type="button"
        class="track-info"
        :title="track.representative.name"
        @click="selectTrack(track.clips, labelForVisual(track.representative), $event)"
        @pointerdown="beginReorder($event, track.id, track.representative.id)"
      >
        <span class="track-drag-handle" @click.stop><GripVertical class="track-grip" /></span>
        <component :is="iconForVisual(track.representative)" class="track-icon" />
        <span class="track-title">{{ labelForVisual(track.representative) }}</span>
      </button>
    </div>
  </TransitionGroup>
  <div class="sidebar-track-item cursor-track" @contextmenu="openTrackContextMenu($event, 'zoom')">
    <div class="track-info static-info">
      <MousePointer class="track-icon" /><span class="track-title">{{ t('zooms') }}</span>
    </div>
  </div>
  <div
    v-if="keyboardCaptionClips.length"
    class="sidebar-track-item annotation-track keyboard-caption-track"
    @contextmenu="openTrackContextMenu($event, 'caption')"
  >
    <button type="button" class="track-info" @click="selectTrack(keyboardCaptionClips, t('keyboardCaptions'), $event)">
      <Keyboard class="track-icon" /><span class="track-title">{{ t('keyboardCaptions') }}</span>
    </button>
  </div>
  <div
    class="sidebar-track-item annotation-track text-caption-track"
    @contextmenu="openTrackContextMenu($event, 'caption')"
  >
    <button type="button" class="track-info" @click="selectTrack(textCaptionClips, t('textCaptions'), $event)">
      <Type class="track-icon" /><span class="track-title">{{ t('textCaptions') }}</span>
    </button>
  </div>
  <div
    v-if="systemAudioClips.length"
    class="sidebar-track-item audio-track"
    :class="{ disabled: !includeAudioInExport || !systemAudioClips.some((clip) => clip.enabled) }"
    @contextmenu="openTrackContextMenu($event, 'audio')"
  >
    <button type="button" class="track-info" @click="selectTrack(systemAudioClips, t('system'), $event)">
      <Volume2 class="track-icon" /><span class="track-title">{{ t('system') }}</span>
      <span v-if="!includeAudioInExport" class="export-disabled-status">{{ t('audioDisabledFromExport') }}</span>
    </button>
  </div>
  <div
    v-if="microphoneClips.length"
    class="sidebar-track-item audio-track"
    :class="{ disabled: !includeAudioInExport || !microphoneClips.some((clip) => clip.enabled) }"
    @contextmenu="openTrackContextMenu($event, 'audio')"
  >
    <button type="button" class="track-info" @click="selectTrack(microphoneClips, t('mic'), $event)">
      <Mic class="track-icon" /><span class="track-title">{{ t('mic') }}</span>
      <span v-if="!includeAudioInExport" class="export-disabled-status">{{ t('audioDisabledFromExport') }}</span>
    </button>
  </div>
  <div
    v-for="track in importedAudioTracks"
    :key="track.id"
    class="sidebar-track-item audio-track"
    :class="{ disabled: !includeAudioInExport || !track.clips.some((clip) => clip.enabled) }"
    @contextmenu="openTrackContextMenu($event, 'audio')"
  >
    <button type="button" class="track-info" @click="selectTrack(track.clips, track.representative.name, $event)">
      <Volume2 class="track-icon" /><span class="track-title">{{ track.representative.name }}</span>
      <span v-if="!includeAudioInExport" class="export-disabled-status">{{ t('audioDisabledFromExport') }}</span>
    </button>
  </div>
</template>
<style scoped src="./timeline-track-headers.css"></style>
