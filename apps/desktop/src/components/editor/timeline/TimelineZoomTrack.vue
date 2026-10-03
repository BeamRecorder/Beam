<script setup lang="ts">
import { Lock } from '@lucide/vue';
import { computed } from 'vue';
import TimelineTrimHandle from './TimelineTrimHandle.vue';
import TimelineCanvasLane from './TimelineCanvasLane.vue';
import TimelineZoomProjectionBadge from './TimelineZoomProjectionBadge.vue';
import { timelineSpanStyle } from './timeline-clip-geometry';
import { useTranslate } from '~/i18n/useTranslate';
import { useTimelineVirtualWindow } from './composables/useTimelineVirtualization';
import type { TimelineZoomTrackProps } from './timeline-zoom-track-types';
const props = defineProps<TimelineZoomTrackProps>();
const window = useTimelineVirtualWindow();
const { t } = useTranslate('TimelineTracks');
const items = computed(() =>
  (window?.visibleZooms(props.zoomElements) ?? props.zoomElements).map((zoom) => ({
    zoom: props.displayedZoom(zoom),
    selected: props.selectedZoomIdSet.has(zoom.id),
    pasteHighlight: props.recentPaste?.type === 'zoom' && props.recentPaste.id === zoom.id,
    label: '',
    labelInset: zoom.locked ? 15 : 0,
  })),
);
</script>
<template>
  <div
    v-if="!window || window.visibleIds.value.has('zoom')"
    class="track-row cursor-track"
    data-timeline-row-id="zoom"
    :style="window?.rowStyle('zoom')"
    @contextmenu="openTrackContextMenu($event, 'zoom')"
  >
    <div
      class="track-content cursor-content"
      :title="t('clickToAddZoom')"
      @pointerdown.stop
      @mousemove="hoverAt($event, 'zoom')"
      @mouseleave="leaveTrack('zoom')"
      @click.stop="addAt($event, 'zoom')"
      @dblclick.stop="addAt($event, 'zoom')"
    >
      <TimelineCanvasLane
        :items="items"
        :duration-ms="layoutDurationMs"
        :width="rulerLayoutWidth"
        :viewport="viewport"
      />
      <div
        v-if="hoverZoomTimeMs !== null"
        class="cursor-zoom-indicator preview-ghost"
        :style="percentageStyle(hoverZoomTimeMs, hoverZoomDurationMs)"
      >
        {{ t('addZoom') }}
      </div>
      <button
        v-for="zoom in window?.visibleZooms(zoomElements) ?? zoomElements"
        :key="zoom.id"
        type="button"
        class="cursor-zoom-indicator canvas-clip-target"
        :data-timeline-zoom-id="zoom.id"
        :aria-label="t('zoomTitle', { level: zoomScale(zoom.depth).toFixed(2) })"
        :class="{
          selected: selectedZoomIdSet.has(zoom.id),
          'paste-arrival': recentPaste?.type === 'zoom' && recentPaste.id === zoom.id,
        }"
        :style="
          timelineSpanStyle(
            displayedZoom(zoom).startMs,
            displayedZoom(zoom).endMs - displayedZoom(zoom).startMs,
            layoutDurationMs / 1000,
            rulerLayoutWidth,
          )
        "
        @click.stop="selectItem('zoom', zoom.id, $event)"
        @contextmenu.prevent.stop="openZoomContextMenu($event, zoom)"
        @pointerdown="startZoomMove($event, zoom)"
      >
        <TimelineTrimHandle
          edge="start"
          :state="trimStateFor(zoom.id)"
          :title="t('trimStart')"
          @start="beginZoomTrim($event, zoom, 'start')"
        />
        <span class="zoom-clip-labels" :class="{ 'has-lock': zoom.locked }">
          <Lock v-if="zoom.locked" :size="12" :aria-label="t('locked')" />
          <TimelineZoomProjectionBadge :zoom="zoom" />
          <span class="clip-center-title zoom-title">{{
            t('zoomTitle', { level: zoomScale(zoom.depth).toFixed(2) })
          }}</span>
          <span class="zoom-meta-badge zoom-mode-badge">{{
            zoom.mode === 'auto' ? t('zoomModeAuto') : t('zoomModeManual')
          }}</span>
        </span>
        <TimelineTrimHandle
          edge="end"
          :state="trimStateFor(zoom.id)"
          :title="t('trimEnd')"
          @start="beginZoomTrim($event, zoom, 'end')"
        />
      </button>
    </div>
  </div>
</template>
<style scoped src="./timeline-tracks.css"></style>
<style scoped src="./timeline-indicators.css"></style>
<style scoped src="./timeline-item-states.css"></style>
<style scoped src="./timeline-zoom-badges.css"></style>
<style scoped>
.cursor-zoom-indicator.canvas-clip-target {
  background: transparent;
  border: 0;
}
</style>
