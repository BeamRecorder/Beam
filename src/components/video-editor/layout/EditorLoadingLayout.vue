<script setup lang="ts">
import { ref } from 'vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import EditorWorkspace from './EditorWorkspace.vue';
import EditorLoadingFrame from './EditorLoadingFrame.vue';
import EditorLoadingProperties from './EditorLoadingProperties.vue';
import EditorSkeletonSurface from './EditorSkeletonSurface.vue';
import ScreenshotCompositionSkeleton from './ScreenshotCompositionSkeleton.vue';
import PropertiesPanelHeader from '../properties/PropertiesPanelHeader.vue';
import CanvasToolbar from '../canvas/CanvasToolbar.vue';
import TimelineToolbar from '../timeline/TimelineToolbar.vue';
import ScreenshotToolbar from '../screenshot/ScreenshotToolbar.vue';
import { DEFAULT_TIMELINE_HEIGHT, clampTimelineHeight } from '../composables/useTimelineResize';
import type { EditorLoadingLayoutProps } from './editor-layout-types';

defineProps<EditorLoadingLayoutProps>();
const toolbarHeight = ref(50);
</script>

<template>
  <EditorWorkspace :kind="kind" class="loading-workspace" aria-hidden="true" inert>
    <div v-if="kind === 'video'" class="loading-sidebar">
      <div class="loading-sidebar-items">
        <Skeleton v-for="index in 6" :key="index" height="48px" radius="var(--radius-sm)" />
      </div>
      <Skeleton height="48px" radius="var(--radius-sm)" />
    </div>
    <aside class="loading-properties" :class="kind">
      <div class="loading-properties-content">
        <PropertiesPanelHeader title="">
          <template #title><Skeleton width="96px" height="24px" /></template>
          <template #actions><Skeleton width="24px" height="24px" /></template>
        </PropertiesPanelHeader>
        <div class="loading-property-fields"><EditorLoadingProperties :still="kind === 'screenshot'" /></div>
      </div>
    </aside>
    <div v-if="kind === 'video'" class="canvas-column">
      <EditorSkeletonSurface class="loading-canvas-toolbar">
        <CanvasToolbar preset="16:9" :can-crop="false" :is-cropping="false" />
      </EditorSkeletonSurface>
      <div class="canvas-preview-stage">
        <div class="canvas-island">
          <div class="canvas-viewport"><EditorLoadingFrame :aspect-ratio="aspectRatio" /></div>
        </div>
        <EditorSkeletonSurface class="loading-playback-toolbar">
          <TimelineToolbar :current-time="0" :duration="0" :is-playing="false" :zoom-level="100" />
        </EditorSkeletonSurface>
      </div>
    </div>
    <div v-else class="screenshot-preview-stage">
      <div class="screenshot-stage" :style="{ '--screenshot-controls-space': `${Math.max(84, toolbarHeight + 40)}px` }">
        <div class="stage-bounds"><EditorLoadingFrame :aspect-ratio="aspectRatio" /></div>
        <div class="canvas-controls">
          <EditorSkeletonSurface class="loading-dock">
            <ScreenshotToolbar
              disabled
              :cropping="false"
              :can-crop="false"
              :drawing="false"
              :editing-text="false"
              panel="canvas"
              inspector-open
              :can-undo="false"
              :can-redo="false"
              @resize="toolbarHeight = $event"
            />
          </EditorSkeletonSurface>
        </div>
        <ScreenshotCompositionSkeleton />
      </div>
    </div>
    <template v-if="kind === 'video'" #after-upper>
      <div class="loading-timeline-resize-space" />
      <div
        class="loading-timeline"
        :style="{ height: `${clampTimelineHeight(timelineHeight ?? DEFAULT_TIMELINE_HEIGHT)}px` }"
      >
        <Skeleton height="100%" radius="inherit" />
      </div>
    </template>
  </EditorWorkspace>
</template>

<style scoped src="./editor-preview-layout.css"></style>
<style scoped src="./editor-loading-layout.css"></style>
