<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineClip from './TimelineClip.vue';
import TimelineGapButtons from './TimelineGapButtons.vue';
import WaveformCanvas from './waveform/WaveformCanvas.vue';
import type { TimelineGap } from '../composition/timeline-lock-types';
import type { TimelineAudioLane, TimelineAudioTracksProps } from './timeline-audio-tracks-types';

const props = defineProps<TimelineAudioTracksProps>();
const emit = defineEmits<{ 'remove:gap': [gap: TimelineGap] }>();
const { t } = useTranslate('TimelineTracks');
const lanes = computed(() => {
  const result: TimelineAudioLane[] = [];
  if (props.systemAudioClips.length) result.push({ id: 'system', clips: props.systemAudioClips });
  if (props.microphoneClips.length) result.push({ id: 'microphone', clips: props.microphoneClips, gaps: true });
  for (const clip of props.voiceoverClips) result.push({ id: `voiceover:${clip.id}`, clips: [clip], voiceover: true });
  if (props.voiceoverDraft) result.push({ id: 'draft', clips: [], voiceover: true, draft: props.voiceoverDraft });
  for (const track of props.importedAudioTracks) result.push({ id: `imported:${track.id}`, clips: track.clips });
  return result;
});
</script>

<template>
  <div
    v-for="lane in lanes"
    :key="lane.id"
    class="track-row audio-track"
    :class="{
      'voiceover-track': lane.voiceover,
      'voiceover-draft-track': lane.draft,
      disabled: !lane.draft && (!includeAudioInExport || !lane.clips.some((clip) => clip.enabled)),
      'is-interacting': isWheelZooming || isMoving || isTrimming,
    }"
    @contextmenu="
      !lane.draft &&
      openTrackContextMenu(
        $event,
        'audio',
        undefined,
        lane.clips.map((clip) => clip.id),
      )
    "
  >
    <div class="track-content audio-content">
      <span v-if="!includeAudioInExport" class="export-audio-disabled">{{ t('audioDisabledFromExport') }}</span>
      <div
        v-if="lane.draft"
        class="voiceover-draft-clip"
        :style="percentageStyle(lane.draft.startMs, lane.draft.durationMs)"
      >
        <WaveformCanvas :bars="lane.draft.bars" selected />
      </div>
      <TimelineGapButtons
        v-if="lane.gaps"
        :clips="lane.clips"
        :composition="composition"
        :duration-ms="layoutDurationMs"
        :width-px="rulerLayoutWidth"
        :moving="isMoving || isTrimming"
        @remove="emit('remove:gap', $event)"
      />
      <TimelineClip
        v-for="clip in lane.clips"
        :key="clip.id"
        :clip="displayedClip(clip)"
        :asset="assetFor(clip)"
        :duration="layoutDurationMs / 1000"
        :timeline-width-px="rulerLayoutWidth"
        :thumbnail-slots="thumbnailSlots"
        :defer-thumbnail-requests="isWheelZooming || isTrimming || isMoving"
        :defer-waveform-draw="isWheelZooming || isMoving"
        :selected="selectedClipIdSet.has(clip.id)"
        :waveform-bars="audioWaveforms[clip.id]?.bars"
        :waveform-bands="audioWaveforms[clip.id]?.bands"
        :waveform-source-duration-seconds="audioWaveforms[clip.id]?.sourceDurationSeconds"
        :waveform-left-percent="audioWaveforms[clip.id]?.leftPercent"
        :waveform-width-percent="audioWaveforms[clip.id]?.widthPercent"
        :waveform-loading-segments="audioWaveforms[clip.id]?.loadingSegments"
        :waveform-status="audioWaveformStatus[clip.id]"
        :waveform-error="audioWaveformErrors[clip.id]"
        :trim-state="trimStateFor(clip.id)"
        :paste-highlight="recentPaste?.type === 'clip' && recentPaste.id === clip.id"
        @select="selectItem('clip', clip.id, $event)"
        @contextmenu="openClipContextMenu($event, clip)"
        @move="startClipMove($event, clip)"
        @trim="beginClipTrim($event.event, clip, $event.edge)"
      />
    </div>
  </div>
</template>

<style scoped src="./timeline-tracks.css"></style>
<style scoped>
.is-interacting .timeline-clip {
  will-change: transform, width;
  transition: none;
}
</style>
