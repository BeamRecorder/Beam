<script setup lang="ts">
import ScreenshotGroupSelection from './ScreenshotGroupSelection.vue';
import { useScreenshotCanvasGeometry } from './useScreenshotCanvasGeometry';
import { createScreenshotAlignment } from './screenshot-alignment';
import { transformScreenshotGroup } from '@beam/engine/screenshot/screenshot-groups';
import type { AlignmentMeasurement } from '@beam/engine/layout/alignment-index-types';
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
} from '~/composables/property-interaction';
import { createCanvasFrameScheduler } from '../editor/canvas/composables/canvas-frame-scheduler';
import { createScreenshotDragRenderer } from './screenshot-drag-renderer';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import { anchorScreenshotResize } from './screenshot-media-resize';
import { withScreenshotTransform } from './screenshot-transform';
import ElementCanvasOverlay from '../editor/elements/ElementCanvasOverlay.vue';
import { useElementEditor } from '../editor/elements/useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { ScreenshotCanvasProps, ScreenshotCanvasEmits } from './screenshot-canvas-contract-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import StillZoomSelection from './StillZoomSelection.vue';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import ScreenshotCropSelection from './ScreenshotCropSelection.vue';
import { rotateMediaVector } from '@beam/engine/layout/media-rotation';
import { screenshotImageFraming, resizeScreenshotImage } from '@beam/engine/screenshot/screenshot-geometry';
import CanvasLayerSelection from '../editor/canvas/CanvasLayerSelection.vue';
import { useScreenshotCanvasAssets } from './useScreenshotCanvasAssets';
import { injectScreenshotStartup } from './loading/screenshot-startup-context';
import { releaseCompositedLayerSurface } from '@beam/runtime/composition/render-composited-layer';
import { drawScreenshot } from '@beam/runtime/screenshot/screenshot-render';
import CanvasRecenterButton from '../editor/canvas/CanvasRecenterButton.vue';
import EditorLoadingFrame from '../editor/layout/EditorLoadingFrame.vue';
import { moveScreenshotLayer } from './screenshot-state';
import type { ScreenshotDrag, ScreenshotTranslation } from './screenshot-types';
import { movableScreenshotSelection, withScreenshotTranslation } from './screenshot-selection-transform';
import { screenshotLayerTransform, screenshotLayerRotation } from './screenshot-layer-geometry';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import ScreenshotMarqueeSurface from './ScreenshotMarqueeSurface.vue';
import ScreenshotAlignmentGuides from './ScreenshotAlignmentGuides.vue';
import { screenshotPreviewSize } from './screenshot-preview-resolution';
import { useScreenshotViewport } from './useScreenshotViewport';
import { screenshotCanvasInteraction } from './screenshot-canvas-interaction';
import CanvasAddMenu from '../editor/search/CanvasAddMenu.vue';
const { t } = useTranslate('ScreenshotEditor');
const { t: canvasText } = useTranslate('CanvasPanel');
const elements = useElementEditor();
const props = withDefaults(defineProps<ScreenshotCanvasProps>(), { zoomDisabled: undefined });
const emit = defineEmits<ScreenshotCanvasEmits>();
const zoomDraft = shallowRef<ZoomElement | null>(null);
const selectedZoom = computed(() => {
  const zoom = props.state.zooms?.find((zoom) => zoom.id === props.selectedId);
  return zoom
    ? { ...zoom, locked: props.state.composition?.find((layer) => layer.id === zoom.id)?.locked ?? false }
    : null;
});
const stage = ref<HTMLElement | null>(null);
const viewport = useScreenshotViewport(
  stage,
  () => props.state.canvas,
  () => Boolean(props.zoomDisabled ?? props.disabled) || dragging.value || Boolean(elements?.editing.value),
);
const { available, stageSize, stageStyle } = viewport;
defineExpose({ resetView: viewport.viewport.resetZoom, zoomPercent: viewport.viewport.zoomPercent });
const canvas = ref<HTMLCanvasElement | null>(null);
const initialFramePending = ref(true);
const startup = injectScreenshotStartup();
const resources = useScreenshotCanvasAssets(
  props,
  () => paint(),
  (reason) => {
    initialFramePending.value = false;
    startup?.fail(reason);
    emit('error', String(reason));
  },
);
const { assets } = resources;
let painted = false;
let drag: ScreenshotDrag | null = null;
let rotating = false;
const dragging = ref(false);
const dragRenderer = createScreenshotDragRenderer();
const transformDraft = shallowRef<NormalizedTransform | null>(null);
let pendingTransform: NormalizedTransform | null = null;
const translationDraft = shallowRef<ScreenshotTranslation | null>(null);
let pendingTranslation: ScreenshotTranslation | null = null;
let alignment: ReturnType<typeof createScreenshotAlignment> | null = null;
const activeGuideLines = shallowRef<{ type: 'horizontal' | 'vertical'; position: number }[]>([]);
const activeMeasurements = shallowRef<AlignmentMeasurement[]>([]);
const flushTransform = () => {
  if (pendingTranslation) {
    translationDraft.value = pendingTranslation;
    pendingTranslation = null;
  }
  if (!pendingTransform) return;
  transformDraft.value = pendingTransform;
  pendingTransform = null;
};
const previewState = computed(() =>
  translationDraft.value && drag?.selection
    ? withScreenshotTranslation(props.state, drag.selection, translationDraft.value)
    : props.selectedId && transformDraft.value
      ? drag?.selection && drag.corner
        ? transformScreenshotGroup(props.state, drag.selection, drag.initial, transformDraft.value)
        : withScreenshotTransform(props.state, props.selectedId, transformDraft.value, assets.value)
      : props.state,
);
const activeImage = computed(() => screenshotImage(previewState.value, props.selectedId));
const activeImageAssets = computed(() =>
  props.selectedId === props.state.image.id ? assets.value : assets.value?.images?.get(props.selectedId ?? ''),
);
const imageTransform = computed(() => {
  return screenshotLayerTransform(previewState.value, assets.value, props.selectedId ?? props.state.image.id)!;
});
const { selections, selectionBounds, marqueeTargets, editingRotation3d } = useScreenshotCanvasGeometry(
  props,
  previewState,
  assets,
  stageSize,
  () => elements?.editing.value?.id,
  (bounds) => emit('selectionBounds', bounds),
);
const paint = () => {
  if (!resources.isReady()) return;
  const ctx = canvas.value?.getContext('2d');
  if (!ctx || !assets.value || !canvas.value || !available.width.value || !available.height.value) return;
  const { width, height } = screenshotPreviewSize(props.state.canvas, stageSize.value, window.devicePixelRatio);
  if (canvas.value.width !== width) canvas.value.width = width;
  if (canvas.value.height !== height) canvas.value.height = height;
  try {
    const state = zoomDraft.value
      ? {
          ...previewState.value,
          zooms: previewState.value.zooms?.map((zoom) =>
            zoom.id === zoomDraft.value!.id ? { ...zoom, ...zoomDraft.value!, mode: 'manual' as const } : zoom,
          ),
        }
      : previewState.value;
    const preview = props.cropping
      ? {
          ...state,
          image: props.selectedId === state.image.id ? { ...state.image, crop: undefined } : state.image,
          images: state.images?.map((image) => (image.id === props.selectedId ? { ...image, crop: undefined } : image)),
        }
      : state;
    if (drag && props.selectedId)
      dragRenderer.draw(
        ctx,
        preview,
        assets.value,
        width,
        height,
        drag.selection?.[0] ?? props.selectedId,
        elements?.editing.value?.id,
      );
    else {
      const render = () => {
        if (!painted && startup)
          drawScreenshot(ctx, preview, assets.value!, width, height, elements?.editing.value?.id, (layer, ms) =>
            startup.record(`layer.${layer.kind}:${layer.id}`, ms),
          );
        else drawScreenshot(ctx, preview, assets.value!, width, height, elements?.editing.value?.id);
      };
      if (!painted && startup) startup.time('firstRender', render);
      else render();
    }
    if (!painted) {
      startup?.finish(width, height);
      painted = true;
      initialFramePending.value = false;
      emit('ready');
    }
  } catch (reason) {
    startup?.fail(reason);
    initialFramePending.value = false;
    emit('error', String(reason));
  }
};
const frames = createCanvasFrameScheduler(
  () => {
    flushTransform();
    paint();
  },
  () => false,
);
watch(() => elements?.editing.value?.id, frames.requestRender);
watch(
  [canvas, stageSize, () => props.state, () => props.cropping],
  () => {
    dragRenderer.reset();
    frames.requestRender();
  },
  {
    deep: true,
    flush: 'post',
  },
);
const addMenu = ref<InstanceType<typeof CanvasAddMenu> | null>(null);
const { layerAt, selectHit, select, editLayer } = screenshotCanvasInteraction({
  state: () => props.state,
  assets: () => assets.value,
  canvas: () => canvas.value,
  selectedIds: () => props.selectedIds,
  blocked: () => {
    const { isPanning, isSpacePressed } = viewport.viewport;
    return Boolean(
      props.cropping || props.disabled || isPanning.value || isSpacePressed.value || elements?.drawingMode.value,
    );
  },
  select: (id, mode) => {
    if (mode) emit('select', id, mode);
    else emit('select', id);
  },
  beginText: (id) => elements?.beginText(id),
  crop: (id) => emit('cropRequest', id),
  add: (event) => void addMenu.value?.open(event),
});
const beginRotation = () => {
  if (props.disabled || props.cropping || rotating) return;
  rotating = true;
  dragging.value = true;
  beginPropertyInteraction();
};
const rotate = (value: number) => {
  if (rotating) emit('rotate', value);
};
const endRotation = (value: number) => {
  if (!rotating) return;
  emit('rotate', value);
  rotating = false;
  dragging.value = false;
  endPropertyInteraction();
};
const start = (event: PointerEvent, corner?: ResizeCorner, selectionId?: string) => {
  if (props.cropping || props.disabled || event.button !== 0) return;
  const selectedOutlineId = props.selectedIds.length > 1 ? selectionId : undefined;
  const hitId = corner ? null : layerAt(event);
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    event.stopPropagation();
    selectHit(hitId ?? selectedOutlineId ?? null, true);
    return;
  }
  const groupCorner = corner && selectionBounds.value;
  let targetId = selectedOutlineId ?? props.selectedId;
  if (!corner) {
    const id = hitId ?? selectedOutlineId;
    if (!id || !props.selectedIds.includes(id)) {
      event.stopPropagation();
      selectHit(id ?? null);
      return;
    }
    targetId = id;
  }
  const target = screenshotLayers(props.state).find((layer) => layer.id === targetId);
  const targetTransform = targetId ? screenshotLayerTransform(props.state, assets.value, targetId) : null;
  if (!target || !targetTransform || target.locked) return;
  event.preventDefault();
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  if (!drag) beginPropertyInteraction();
  dragging.value = true;
  dragRenderer.reset();
  const bounds = canvas.value!.getBoundingClientRect();
  drag = {
    x: event.clientX,
    y: event.clientY,
    width: bounds.width,
    height: bounds.height,
    initial: { ...(groupCorner || screenshotImage(props.state, targetId)?.transform || targetTransform) },
    corner,
    targetId: targetId ?? undefined,
    clickId: hitId ?? undefined,
    selection:
      !corner || groupCorner
        ? movableScreenshotSelection(props.state, props.selectedIds).map((layer) => layer.id)
        : undefined,
  };
  alignment = createScreenshotAlignment(props.state, assets.value, drag.selection ?? [target.id], bounds);
  if (corner && !groupCorner && activeImage.value && activeImageAssets.value) {
    const { width, height } = props.state.canvas;
    const { rect } = screenshotImageFraming(
      { ...props.state, image: activeImage.value },
      activeImageAssets.value.width,
      activeImageAssets.value.height,
      width,
      height,
    );
    drag.initial = { ...imageTransform.value };
    drag.imageFrame = {
      x: rect.x / width,
      y: rect.y / height,
      width: rect.width / width,
      height: rect.height / height,
    };
  }
};
const move = (event: PointerEvent) => {
  if (!drag || !canvas.value) return;
  const delta = { x: (event.clientX - drag.x) / drag.width, y: (event.clientY - drag.y) / drag.height };
  const rotation =
    drag.corner && !drag.selection && drag.targetId ? screenshotLayerRotation(props.state, drag.targetId) : 0;
  const local = rotateMediaVector(
    { x: delta.x * props.state.canvas.width, y: delta.y * props.state.canvas.height },
    -rotation,
  );
  const dx = local.x / props.state.canvas.width,
    dy = local.y / props.state.canvas.height;
  if (drag.selection && !drag.corner) {
    if (!translationDraft.value && !pendingTranslation && Math.hypot(dx * drag.width, dy * drag.height) < 4) return;
    const snapped = alignment!({ x: dx, y: dy }, event.altKey);
    pendingTranslation = snapped.translation;
    activeGuideLines.value = snapped.guides;
    activeMeasurements.value = snapped.measurements;
    frames.requestRender();
    return;
  }
  if (drag.selection && drag.corner) {
    pendingTransform = resizeScreenshotImage(drag.initial, drag.initial, dx, dy, drag.corner);
    frames.requestRender();
    return;
  }
  const effect = props.state.effects?.find((item) => item.id === props.selectedId);
  const proportionalFrame = drag.imageFrame ?? (effect && effect.shape !== 'rectangle' ? drag.initial : undefined);
  pendingTransform =
    proportionalFrame && drag.corner
      ? resizeScreenshotImage(drag.initial, proportionalFrame, dx, dy, drag.corner)
      : moveScreenshotLayer(drag.initial, dx, dy, drag.corner);
  if (rotation && pendingTransform && drag.targetId)
    pendingTransform = anchorScreenshotResize(props.state, drag.targetId, pendingTransform, assets.value);
  frames.requestRender();
};
const endDrag = () => {
  flushTransform();
  if (translationDraft.value) emit('translate', translationDraft.value);
  if (transformDraft.value) {
    if (drag?.selection && drag.corner) emit('resizeSelection', drag.initial, transformDraft.value);
    else emit('transform', transformDraft.value);
  }
  const clickedId = drag?.selection && !translationDraft.value && !transformDraft.value ? drag.clickId : undefined;
  translationDraft.value = null;
  transformDraft.value = null;
  if (drag) endPropertyInteraction();
  drag = null;
  alignment = null;
  activeGuideLines.value = [];
  activeMeasurements.value = [];
  dragging.value = false;
  dragRenderer.reset();
  frames.requestRender();
  if (clickedId) selectHit(clickedId);
};
watch(
  () => props.selectedIds,
  () => {
    pendingTransform = null;
    transformDraft.value = null;
    pendingTranslation = null;
    translationDraft.value = null;
    if (drag) drag.clickId = undefined;
    endDrag();
  },
);
onBeforeUnmount(() => {
  endDrag();
  if (rotating) endPropertyInteraction();
  const context = canvas.value?.getContext('2d');
  if (context) releaseCompositedLayerSurface(context);
  frames.dispose();
});
</script>

<template>
  <div class="screenshot-stage" @pointerdown.self="select">
    <CanvasAddMenu ref="addMenu" />
    <div
      ref="stage"
      class="stage-bounds"
      :class="{ 'is-grabbing': viewport.viewport.isPanning.value }"
      @pointerdown.self="select"
      @dblclick="editLayer"
      @click="editLayer"
      @wheel="viewport.wheel"
      @pointerdown.capture="viewport.beginPan"
      @pointermove="viewport.movePan"
      @pointerup="viewport.endPan"
      @pointercancel="viewport.endPan"
      @lostpointercapture="viewport.endPan"
    >
      <ScreenshotMarqueeSurface
        :canvas="canvas"
        :viewport="stageSize"
        :targets="() => marqueeTargets"
        :selection="selectedIds"
        :layer-at="layerAt"
        :space-pressed="viewport.viewport.isSpacePressed.value"
        :disabled="disabled || cropping || Boolean(elements?.editing.value || elements?.drawingMode.value)"
        @select="emit('selectMany', $event)"
      >
        <div class="image-stage" :style="stageStyle">
          <canvas ref="canvas" :aria-label="t('preview')" @pointerdown="select" />
          <StillZoomSelection
            v-if="selectedZoom && !disabled && !cropping"
            :zoom="selectedZoom"
            :canvas-size="state.canvas"
            :size="stageSize"
            :panning="viewport.viewport.isPanning.value || viewport.viewport.isSpacePressed.value"
            @update="emit('updateZoom', $event)"
            @preview="
              zoomDraft = $event;
              frames.requestRender();
            "
          />
          <ScreenshotAlignmentGuides
            :guides="dragging && translationDraft ? activeGuideLines : []"
            :measurements="dragging && translationDraft ? activeMeasurements : []"
          />
          <CanvasLayerSelection
            v-for="selection in cropping ? [] : selections"
            :key="selection.id"
            :data-layer-id="selection.id"
            :viewport-style="{ inset: '0' }"
            :handle-style="selection.style"
            :resize-corners="!selectionBounds && selection.id === selectedId ? undefined : []"
            :rotation="selection.rotation"
            :rotatable="!selectionBounds && selection.id === selectedId && selection.rotatable"
            :rotate-label="canvasText('shapeRotation')"
            :muted="handlesMuted || (propertyInteractionActive && !dragging)"
            @pointer-down="start($event, undefined, selection.id)"
            @pointer-move="move"
            @pointer-up="endDrag"
            @resize-start="(corner, event) => start(event, corner, selection.id)"
            @resize-move="move"
            @resize-end="endDrag"
            @rotate-start="beginRotation"
            @rotate="rotate"
            @rotate-end="endRotation"
          />
          <ScreenshotGroupSelection
            v-if="selectionBounds && !cropping"
            :bounds="selectionBounds"
            :viewport="stageSize"
            :muted="handlesMuted"
            @start="start($event, undefined, selectedId ?? undefined)"
            @move="move"
            @end="endDrag"
            @resize="(corner, event) => start(event, corner)"
          />
          <ElementCanvasOverlay
            :rotation3d="editingRotation3d"
            :viewport="{ x: 0, y: 0, ...stageSize }"
            :surface-size="stageSize"
          />
          <ScreenshotCropSelection
            v-if="cropping && activeImage && activeImageAssets"
            :state="{ ...state, image: activeImage }"
            :source-size="activeImageAssets"
            @crop="emit('crop', $event)"
            @done="emit('cropDone')"
          />
        </div>
        <Transition name="canvas-frame-ready">
          <EditorLoadingFrame v-if="initialFramePending" :aspect-ratio="state.canvas.width / state.canvas.height" />
        </Transition>
      </ScreenshotMarqueeSurface>
    </div>
    <div v-if="viewport.viewport.isOutOfBounds.value" class="canvas-recenter-float" @pointerdown.stop>
      <CanvasRecenterButton
        :disabled="Boolean(zoomDisabled ?? disabled) || dragging || Boolean(elements?.editing.value)"
        @click="viewport.viewport.resetZoom"
      />
    </div>
    <div class="canvas-controls"><slot name="controls" /></div>
    <slot name="overlay" />
  </div>
</template>
<style scoped src="./screenshot-canvas.css"></style>
<style scoped src="../editor/layout/editor-preview-layout.css"></style>
