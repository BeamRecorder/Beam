<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { ArrowLeft, ChevronDown, Download, Search } from '@lucide/vue';
import EditorTitlebar from '../../../apps/desktop/src/components/editor/EditorTitlebar.vue';
import EditorWorkspace from '../../../apps/desktop/src/components/editor/layout/EditorWorkspace.vue';
import SidebarPanel from '../../../apps/desktop/src/components/editor/sidebar/SidebarPanel.vue';
import CanvasToolbar from '../../../apps/desktop/src/components/editor/canvas/CanvasToolbar.vue';
import CanvasLayerSelection from '../../../apps/desktop/src/components/editor/canvas/CanvasLayerSelection.vue';
import TimelineTracks from '../../../apps/desktop/src/components/editor/timeline/TimelineTracks.vue';
import TimelineToolbar from '../../../apps/desktop/src/components/editor/timeline/TimelineToolbar.vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import DemoCursor from './DemoCursor.vue';
import Inspector from './Inspector.vue';
import icon from '../assets/BeamIcon.webp';
import { BASE, compositionAt, shapeClip, blurClip } from './scene-model';
import { modeAt, previewTimeAt, transitionAt } from './motion';
import { createFilmPainter } from './preview';
import { selectionAt } from './selection';
import type { CameraSample } from '@beam/engine/zoom/composition-camera-types';
import type { FilmPose, FrameRect } from './film-types';
const props = defineProps<{ pose: FilmPose }>();
const filmCanvas = ref<HTMLCanvasElement | null>(null),
  target = ref<HTMLDivElement | null>(null);
const cursor = ref<InstanceType<typeof DemoCursor> | null>(null);
const rect = ref<FrameRect>({ x: 500, y: 100, width: 1000, height: 562.5 });
const camera = ref<CameraSample>({ focus: { cx: 0.5, cy: 0.5 }, scale: 1 });
const open = computed(() => transitionAt(props.pose.time));
const composition = computed(() => compositionAt(props.pose.time));
const mode = computed(() => modeAt(props.pose.time));
const selected = computed(() =>
  mode.value === 'clip'
    ? 'screen'
    : mode.value === 'shape'
      ? 'film-rectangle'
      : mode.value === 'blur'
        ? 'film-blur'
        : null,
);
const canvasStyle = computed(() => ({
  left: `${rect.value.x * open.value}px`,
  top: `${rect.value.y * open.value}px`,
  width: `${1600 + (rect.value.width - 1600) * open.value}px`,
  height: `${900 + (rect.value.height - 900) * open.value}px`,
  borderRadius: `${6 * open.value}px`,
}));
const selection = computed(() => {
  if (props.pose.time < 10.8 || props.pose.time > 16.6) return null;
  const transform = props.pose.time < 13.8 ? shapeClip(props.pose.time).transform : blurClip(props.pose.time).transform;
  return selectionAt(transform, camera.value, rect.value.width, rect.value.height);
});
const anchors = computed(() =>
  [
    ['shape', shapeClip(18).transform],
    ['blur', blurClip(18).transform],
  ].flatMap(([name, transform]) => {
    const projected = selectionAt(
      transform as ReturnType<typeof shapeClip>['transform'],
      camera.value,
      rect.value.width,
      rect.value.height,
    );
    const left = Number.parseFloat(projected.handleStyle.left),
      top = Number.parseFloat(projected.handleStyle.top);
    return [0, 2].map((index) => ({
      name: `${name}-${index === 0 ? 'start' : 'end'}`,
      style: {
        left: `${rect.value.x + left + projected.perspectiveCorners[index]!.x}px`,
        top: `${rect.value.y + top + projected.perspectiveCorners[index]!.y}px`,
      },
    }));
  }),
);
let painter: Awaited<ReturnType<typeof createFilmPainter>>;
const ready = (async () => {
  await nextTick();
  await document.fonts.ready;
  painter = await createFilmPainter(filmCanvas.value!);
  await paint();
})();
async function paint() {
  const bounds = target.value!.getBoundingClientRect();
  rect.value = { x: bounds.x / 1.2, y: bounds.y / 1.2, width: bounds.width / 1.2, height: bounds.height / 1.2 };
  await nextTick();
  camera.value = await painter.paint(props.pose.time);
  await nextTick();
  cursor.value!.paint(props.pose.time);
}
onBeforeUnmount(() => painter?.dispose());
defineExpose({
  ready,
  paint,
  paintCursor: () => cursor.value!.paint(props.pose.time),
  primeCursor: () => cursor.value!.prime(),
});
</script>
<template>
  <div class="film-stage">
    <div class="film-editor" :style="{ opacity: open }">
      <EditorTitlebar>
        <template #left>
          <img :src="icon" class="film-brand" alt="Beam" />
          <Button variant="ghost" size="sm" :icon="ArrowLeft">Back to Recorder</Button>
          <Button variant="secondary" size="xs">Default <ChevronDown :size="12" /></Button>
          <Button variant="ghost" size="xs" :icon="Search" icon-only aria-label="Search" />
        </template>
        <template #center
          ><span class="film-project-name">Video for BeamMainPage <ChevronDown :size="12" /></span
        ></template>
        <template #right><Button variant="primary" size="sm" :icon="Download">Export</Button></template>
      </EditorTitlebar>
      <EditorWorkspace kind="video">
        <SidebarPanel :active-tab="mode === 'canvas' ? 'canvas' : 'clip'" />
        <Inspector :pose="pose" />
        <div class="film-preview-column">
          <CanvasToolbar preset="16:9" :can-crop="true" :is-cropping="false" />
          <div class="film-preview-space">
            <div ref="target" class="film-preview-target"></div>
          </div>
          <TimelineToolbar
            :current-time="previewTimeAt(pose.time)"
            :duration="BASE.duration"
            :is-playing="pose.time >= 16.6 && pose.time < 17.85"
            :zoom-level="100"
            :can-split="mode === 'clip'"
            :can-undo="pose.time > 4.7"
          />
        </div>
        <template #after-upper>
          <div class="film-timeline">
            <TimelineTracks
              :current-time="previewTimeAt(pose.time)"
              :duration="BASE.duration"
              :is-playing="false"
              :zoom-level="100"
              :composition="composition"
              :zoom-elements="BASE.zooms"
              :selected-zoom-id="null"
              :selected-clip-id="selected"
              :selected-clip-ids="selected ? [selected] : []"
              :canvas="BASE.canvas"
            />
          </div>
        </template>
      </EditorWorkspace>
    </div>
    <canvas ref="filmCanvas" class="film-canvas" width="1920" height="1080" :style="canvasStyle" />
    <div class="film-selection-layer">
      <CanvasLayerSelection
        v-if="selection"
        :viewport-style="canvasStyle"
        v-bind="selection"
        :resize-corners="['top-left', 'top-right', 'bottom-left', 'bottom-right']"
      />
    </div>
    <span
      v-for="anchor in anchors"
      :key="anchor.name"
      class="film-anchor"
      :data-film-anchor="anchor.name"
      :style="anchor.style"
      aria-hidden="true"
    />
  </div>
  <DemoCursor ref="cursor" />
</template>
