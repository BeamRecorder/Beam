<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import TimelineCanvasClips from './TimelineCanvasClips.vue';
import TimelineGapButtons from './TimelineGapButtons.vue';
import WaveformCanvas from './waveform/WaveformCanvas.vue';
import type { TimelineGap } from '@beam/engine/composition/timeline-lock-types';
import type { TimelineAudioLane, TimelineAudioTracksProps } from './timeline-audio-tracks-types';
import { createTimelineLinkedClipNameResolver } from './timeline-linked-clips';
import { useTimelineVirtualWindow, useVirtualTimelineItems } from './composables/useTimelineVirtualization';

const props = defineProps<TimelineAudioTracksProps>();
const emit = defineEmits<{ 'remove:gap': [gap: TimelineGap] }>();
const { t } = useTranslate('TimelineTracks');
const window = useTimelineVirtualWindow();
const linkedNames = computed(() => createTimelineLinkedClipNameResolver(props.composition));
const lanes = computed(() => {
  const result: TimelineAudioLane[] = [];
  if (props.systemAudioClips.length) result.push({ id: 'system', clips: props.systemAudioClips });
  if (props.microphoneClips.length) result.push({ id: 'microphone', clips: props.microphoneClips, gaps: true });
  for (const clip of props.voiceoverClips) result.push({ id: `voiceover:${clip.id}`, clips: [clip], voiceover: true });
  if (props.voiceoverDraft) result.push({ id: 'draft', clips: [], voiceover: true, draft: props.voiceoverDraft });
  for (const track of props.importedAudioTracks) result.push({ id: `imported:${track.id}`, clips: track.clips });
  return result;
});
const visibleLanes = useVirtualTimelineItems(
  () => lanes.value,
  (lane) => lane.id,
);
const audioFor = (id: string) => ({
  waveformBars: props.audioWaveforms[id]?.bars,
  waveformBands: props.audioWaveforms[id]?.bands,
  waveformSourceDurationSeconds: props.audioWaveforms[id]?.sourceDurationSeconds,
  waveformLeftPercent: props.audioWaveforms[id]?.leftPercent,
  waveformWidthPercent: props.audioWaveforms[id]?.widthPercent,
  waveformLoadingSegments: props.audioWaveforms[id]?.loadingSegments,
  waveformStatus: props.audioWaveformStatus[id],
  waveformError: props.audioWaveformErrors[id],
});
</script>

<template>
  <div
    v-for="lane in visibleLanes"
    :key="lane.id"
    :data-timeline-row-id="lane.id"
    :style="window?.rowStyle(lane.id)"
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
        :zoom-elements="zoomElements"
        :duration-ms="layoutDurationMs"
        :width-px="rulerLayoutWidth"
        :moving="isMoving || isTrimming"
        @remove="emit('remove:gap', $event)"
      />
      <TimelineCanvasClips
        :clips="window?.visibleClips(lane.clips) ?? lane.clips"
        :displayed-clip="displayedClip"
        :asset-for="assetFor"
        :canvas="undefined"
        :duration-ms="layoutDurationMs"
        :width="rulerLayoutWidth"
        :viewport="viewport"
        :thumbnail-slots="thumbnailSlots"
        :defer-media="isWheelZooming || isTrimming || isMoving"
        :selected-ids="selectedClipIdSet"
        :linked-names="linkedNames"
        :audio-for="audioFor"
        :trim-state-for="trimStateFor"
        :paste-id="recentPaste?.type === 'clip' ? recentPaste.id : undefined"
        @select="(event, clip) => selectItem('clip', clip.id, event)"
        @contextmenu="openClipContextMenu"
        @move="startClipMove"
        @trim="beginClipTrim"
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
<style scoped src="./timeline-item-states.css"></style>
