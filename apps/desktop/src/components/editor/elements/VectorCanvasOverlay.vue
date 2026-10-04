<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { hasLayerRotation3d } from '@beam/engine/layout/layer-perspective';
import type { LayerRotation3d } from '@beam/engine/layout/layer-perspective-types';
import { vectorPathData } from '@beam/engine/shared/shape-vector-svg';
import {
  insertVectorNode,
  moveVectorPoint,
  reframeVector,
  removeVectorNode,
} from '@beam/engine/shared/shape-vector-edit';
import { closestVectorSegment, snapVectorPoint } from '@beam/engine/shared/shape-vector-hit';
import { MAX_VECTOR_NODES } from '@beam/engine/shared/shape-vector-schema';
import type { VectorHandleSelection, VectorPoint, VectorSnap } from '@beam/engine/shared/shape-vector-types';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import type { ElementCamera, ElementViewport } from './element-editor-types';
import type { VectorDrag } from './vector-overlay-types';
import { elementMatrix } from './element-projection';
import { parseElementMatrix, projectVectorPoint, unprojectVectorPoint } from './vector-projection';
import { useElementEditor } from './useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { useCanvasControlContrast } from '~/ui/ResizeHandle/useCanvasControlContrast';
const vCanvasControlContrast = useCanvasControlContrast();
const props = defineProps<{
  viewport: ElementViewport;
  camera?: ElementCamera;
  rotation3d?: LayerRotation3d;
  surfaceSize: { width: number; height: number };
}>();
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const surface = ref<HTMLElement | null>(null);
const guides = ref<VectorSnap['guides']>([]);
const clip = computed(() =>
  editor?.selected.value?.id === editor?.vectorEditing.value ? editor?.selected.value : null,
);
const frame = computed(() => {
  const c = clip.value;
  if (!c?.vector) return null;
  const rect = {
    x: props.viewport.x + c.transform.x * props.viewport.width,
    y: props.viewport.y + c.transform.y * props.viewport.height,
    width: c.transform.width * props.viewport.width,
    height: c.transform.height * props.viewport.height,
  };
  const css = elementMatrix(rect, props.viewport, props.camera, c.rotation, props.rotation3d);
  const matrix = parseElementMatrix(css);
  const position = (p: VectorPoint) => projectVectorPoint({ x: p.x * rect.width, y: p.y * rect.height }, matrix);
  const anchors = c.vector.contours.flatMap((contour, contourIndex) =>
    contour.nodes.map((node, nodeIndex) => ({
      ...position(node),
      id: node.id,
      selected: editor?.selectedNode.value?.contour === contourIndex && editor.selectedNode.value.node === nodeIndex,
      selection: { contour: contourIndex, node: nodeIndex },
      node,
    })),
  );
  const handles = anchors
    .filter((a) => a.selected)
    .flatMap((anchor) =>
      (['in', 'out'] as const).flatMap((handle) => {
        const p = anchor.node[handle];
        return p ? [{ ...position(p), anchor, selection: { ...anchor.selection, handle } }] : [];
      }),
    );
  return { rect, css, matrix, anchors, handles, path: vectorPathData(c.vector, rect.width, rect.height) };
});
let drag: VectorDrag | null = null;
const release = () => {
  const active = drag;
  drag = null;
  guides.value = [];
  if (!active) return;
  if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  endPropertyInteraction();
};
const start = (event: PointerEvent, selection: VectorHandleSelection) => {
  if (event.button !== 0 || drag || !clip.value?.vector || !frame.value || !editor?.canInteract.value) return;
  event.preventDefault();
  event.stopPropagation();
  editor.selectedNode.value = { contour: selection.contour, node: selection.node };
  const target = event.currentTarget as Element;
  drag = {
    pointerId: event.pointerId,
    selection,
    layerId: clip.value.id,
    vector: clip.value.vector,
    transform: clip.value.transform,
    matrix: frame.value.matrix,
    width: frame.value.rect.width,
    height: frame.value.rect.height,
    target,
  };
  beginPropertyInteraction();
  target.setPointerCapture(event.pointerId);
  (target as HTMLElement).focus({ preventScroll: true });
};
const screenPoint = (event: PointerEvent) => {
  if (!surface.value) return null;
  const bounds = surface.value.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  return {
    x: ((event.clientX - bounds.left) * props.surfaceSize.width) / bounds.width,
    y: ((event.clientY - bounds.top) * props.surfaceSize.height) / bounds.height,
  };
};
const snap = (point: VectorPoint, skip?: VectorHandleSelection) => {
  const result = snapVectorPoint(
    point,
    frame.value!.anchors.filter(
      (anchor) => !skip || anchor.selection.contour !== skip.contour || anchor.selection.node !== skip.node,
    ),
  );
  guides.value = result.guides;
  return result.point;
};
const move = (event: PointerEvent) => {
  if (!drag || drag.pointerId !== event.pointerId || !editor) return;
  const screen = screenPoint(event);
  if (!screen) return;
  if (event.altKey) guides.value = [];
  const point = unprojectVectorPoint(event.altKey ? screen : snap(screen, drag.selection), drag.matrix);
  if (!point) return;
  const normalized = {
    x: Math.max(-8, Math.min(8, point.x / drag.width)),
    y: Math.max(-8, Math.min(8, point.y / drag.height)),
  };
  editor.update({ vector: moveVectorPoint(drag.vector, drag.selection, normalized, event.altKey) });
};
const insert = (event: PointerEvent) => {
  const c = clip.value,
    f = frame.value,
    screen = screenPoint(event);
  if (event.button !== 0 || drag || !c?.vector || !f || !screen || !editor?.canInteract.value) return;
  const existing = f.anchors.find((anchor) => Math.hypot(anchor.x - screen.x, anchor.y - screen.y) < 8);
  if (existing) {
    editor.selectedNode.value = existing.selection;
    return;
  }
  if (c.vector.contours.reduce((sum, contour) => sum + contour.nodes.length, 0) >= MAX_VECTOR_NODES) return;
  const local = unprojectVectorPoint(screen, f.matrix);
  if (!local) return;
  const point = { x: local.x / f.rect.width, y: local.y / f.rect.height };
  const hit = closestVectorSegment(c.vector, point, f.rect.width, f.rect.height);
  if (!hit) return;
  let vector = insertVectorNode(c.vector, hit, Math.max(0.001, Math.min(0.999, hit.t)));
  const selection = { contour: hit.contour, node: hit.node + 1 };
  // A click on the path preserves its curve; a click beside it bends a new smooth anchor.
  if (hit.distance > 8) {
    const placed = unprojectVectorPoint(event.altKey ? screen : snap(screen), f.matrix);
    if (!placed) return;
    vector = moveVectorPoint(vector, selection, {
      x: Math.max(-8, Math.min(8, placed.x / f.rect.width)),
      y: Math.max(-8, Math.min(8, placed.y / f.rect.height)),
    });
  }
  beginPropertyInteraction();
  editor.update({ vector });
  editor.selectedNode.value = selection;
  commit();
  // Insertion is one completed edit rather than a pointer capture gesture.
  endPropertyInteraction();
  surface.value?.focus({ preventScroll: true });
};
const commit = () => {
  const c = clip.value,
    canvas = editor?.canvasSize.value;
  // Extending the rectangle changes the perspective pivot. Keep it fixed for 3D layers.
  if (c?.vector && canvas && !hasLayerRotation3d(props.rotation3d))
    editor!.update(reframeVector(c.vector, c.transform, canvas, c.rotation));
  release();
};
const end = (event: PointerEvent) => {
  if (drag?.pointerId !== event.pointerId) return;
  move(event);
  commit();
};
const cancel = () => {
  if (drag && editor?.selected.value?.id === drag.layerId)
    editor.update({ vector: drag.vector, transform: drag.transform });
  release();
};
const keydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.stopPropagation();
    event.preventDefault();
    if (drag) commit();
    editor?.finishVector();
  }
  if (event.key === 'Escape') {
    event.stopPropagation();
    event.preventDefault();
    if (drag) cancel();
    else editor?.finishVector();
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.stopPropagation();
    event.preventDefault();
    const vector = clip.value?.vector,
      selection = editor?.selectedNode.value;
    if (!vector || !selection) return;
    const next = removeVectorNode(vector, selection);
    editor!.update({ vector: next });
    editor!.selectedNode.value = {
      ...selection,
      node: Math.min(selection.node, next.contours[selection.contour]!.nodes.length - 1),
    };
  }
};
watch(() => clip.value?.id, cancel);
onMounted(() => surface.value?.focus({ preventScroll: true }));
onBeforeUnmount(cancel);
</script>
<template>
  <div
    v-if="frame"
    ref="surface"
    v-canvas-control-contrast
    class="vector-overlay"
    tabindex="0"
    @pointerdown.self.prevent.stop="insert"
    @click.stop
    @dblclick.prevent.stop
    @keydown="keydown"
  >
    <svg
      class="path-preview"
      :width="frame.rect.width"
      :height="frame.rect.height"
      :style="{ transform: frame.css }"
      aria-hidden="true"
    >
      <path
        :d="frame.path"
        fill="none"
        stroke="var(--canvas-control-ink, var(--text-primary))"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <svg class="handle-lines" :viewBox="`0 0 ${surfaceSize.width} ${surfaceSize.height}`" aria-hidden="true">
      <line
        v-for="(guide, index) in guides"
        :key="`guide-${index}`"
        class="snap-guide"
        :x1="guide.from.x"
        :y1="guide.from.y"
        :x2="guide.to.x"
        :y2="guide.to.y"
      />
      <line
        v-for="handle in frame.handles"
        :key="`${handle.anchor.id}-${handle.selection.handle}`"
        :x1="handle.anchor.x"
        :y1="handle.anchor.y"
        :x2="handle.x"
        :y2="handle.y"
        stroke="var(--canvas-control-ink, var(--text-primary))"
        stroke-width="1"
      />
    </svg>
    <button
      v-for="anchor in frame.anchors"
      v-canvas-control-contrast
      :key="anchor.id"
      class="anchor"
      :class="{ selected: anchor.selected }"
      :style="{ left: `${(anchor.x / surfaceSize.width) * 100}%`, top: `${(anchor.y / surfaceSize.height) * 100}%` }"
      :aria-label="t('anchorPoint', { index: anchor.selection.node + 1 })"
      :aria-pressed="anchor.selected"
      @click.stop
      @dblclick.stop
      @focus="editor!.selectedNode.value = anchor.selection"
      @pointerdown="start($event, anchor.selection)"
      @pointermove.stop="move"
      @pointerup.stop="end"
      @pointercancel.stop="cancel"
      @lostpointercapture="cancel"
    />
    <button
      v-for="handle in frame.handles"
      v-canvas-control-contrast
      :key="`${handle.anchor.id}-${handle.selection.handle}`"
      class="anchor handle"
      :style="{ left: `${(handle.x / surfaceSize.width) * 100}%`, top: `${(handle.y / surfaceSize.height) * 100}%` }"
      :aria-label="t('curveHandle')"
      @click.stop
      @dblclick.stop
      @pointerdown="start($event, handle.selection)"
      @pointermove.stop="move"
      @pointerup.stop="end"
      @pointercancel.stop="cancel"
      @lostpointercapture="cancel"
    />
  </div>
</template>
<style scoped>
.vector-overlay,
.handle-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.vector-overlay {
  pointer-events: auto;
  outline: none;
  cursor: crosshair;
}
.snap-guide {
  stroke: var(--canvas-control-ink, var(--text-primary));
  stroke-dasharray: 4 3;
  stroke-width: 1;
}
.path-preview {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  overflow: visible;
}
.anchor {
  position: absolute;
  width: 9px;
  height: 9px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px solid var(--canvas-control-ink, var(--text-primary));
  background: var(--canvas-control-ink, var(--text-primary));
  box-shadow: 0 0 0 1px var(--canvas-control-halo, var(--color-bg-surface));
  pointer-events: auto;
  cursor: move;
  touch-action: none;
}
.anchor.selected {
  width: 11px;
  height: 11px;
}
.anchor.handle {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.anchor:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}
</style>
