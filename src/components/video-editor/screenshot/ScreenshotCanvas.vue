<script setup lang="ts">
import {
  beginPropertyInteraction,
  endPropertyInteraction,
  propertyInteractionActive,
} from '~/composables/property-interaction';
import { createCanvasFrameScheduler } from '../canvas/composables/canvas-frame-scheduler';
import { createScreenshotDragRenderer } from './screenshot-drag-renderer';
import { screenshotImage } from './screenshot-images';
import { withScreenshotTransform } from './screenshot-transform';
import ElementCanvasOverlay from '../elements/ElementCanvasOverlay.vue';
import { useElementEditor } from '../elements/useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
import { useElementSize } from '@vueuse/core';
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { ScreenshotState } from '~/api/types/screenshot';
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { NormalizedTransform, NormalizedCrop } from '~/media/shared/composition-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import ScreenshotCropSelection from './ScreenshotCropSelection.vue';
import { screenshotImageFraming, resizeScreenshotImage } from './screenshot-geometry';
import CanvasLayerSelection from '../canvas/CanvasLayerSelection.vue';
import { loadScreenshotAssets, drawScreenshot } from './screenshot-render';
import { moveScreenshotLayer } from './screenshot-state';
import type {
  ScreenshotDrag,
  ScreenshotRenderAssets,
  ScreenshotSelectionMode,
  ScreenshotTranslation,
} from './screenshot-types';
import {
  constrainScreenshotTranslation,
  movableScreenshotSelection,
  withScreenshotTranslation,
} from './screenshot-selection-transform';
import { screenshotLayerAt, screenshotLayerTransform, screenshotLayerRotation } from './screenshot-layer-geometry';
import { screenshotLayers } from './screenshot-layers';
import { createScreenshotImageLoader } from './screenshot-assets';
import CanvasMarqueeSurface from '../canvas/CanvasMarqueeSurface.vue';
import type { CanvasMarqueeSelection, CanvasMarqueeTarget } from '../canvas/canvas-marquee-types';

const { t } = useTranslate('ScreenshotEditor');
const { t: canvasText } = useTranslate('CanvasPanel');
const elements = useElementEditor();
const props = defineProps<{
  source: string;
  state: ScreenshotState;
  selectedId: string | null;
  selectedIds: string[];
  disabled?: boolean;
  cropping?: boolean;
  cursorPacks?: CursorPackDescriptor[];
  cursorPacksReady?: boolean;
  handlesMuted?: boolean;
}>();
const emit = defineEmits<{
  select: [id: string | null, mode?: ScreenshotSelectionMode];
  selectMany: [selection: CanvasMarqueeSelection];
  transform: [value: NormalizedTransform];
  translate: [value: ScreenshotTranslation];
  error: [message: string];
  ready: [];
  crop: [value: NormalizedCrop];
  cropDone: [];
  cropRequest: [id: string];
  rotate: [value: number];
}>();
const stage = ref<HTMLElement | null>(null);
const available = useElementSize(stage);
// ResizeObserver can remain idle while the native editor waits for its first paint.
onMounted(async () => {
  await nextTick();
  const rect = stage.value?.getBoundingClientRect();
  if (rect?.width && rect.height) {
    available.width.value = rect.width;
    available.height.value = rect.height;
  }
});
const stageSize = computed(() => {
  const scale = Math.min(
    available.width.value / props.state.canvas.width,
    available.height.value / props.state.canvas.height,
  );
  return {
    width: Math.max(0, props.state.canvas.width * scale),
    height: Math.max(0, props.state.canvas.height * scale),
  };
});
const stageStyle = computed(() => ({ width: `${stageSize.value.width}px`, height: `${stageSize.value.height}px` }));
const canvas = ref<HTMLCanvasElement | null>(null);
const assets = shallowRef<ScreenshotRenderAssets | null>(null);
const loadImage = createScreenshotImageLoader();
let generation = 0;
let loadedGeneration = 0;
let painted = false;
let drag: ScreenshotDrag | null = null;
let rotating = false;
const dragging = ref(false);
const dragRenderer = createScreenshotDragRenderer();
const transformDraft = shallowRef<NormalizedTransform | null>(null);
let pendingTransform: NormalizedTransform | null = null;
const translationDraft = shallowRef<ScreenshotTranslation | null>(null);
let pendingTranslation: ScreenshotTranslation | null = null;
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
      ? withScreenshotTransform(props.state, props.selectedId, transformDraft.value, assets.value)
      : props.state,
);
const activeImage = computed(() => screenshotImage(previewState.value, props.selectedId));
const activeImageAssets = computed(() =>
  props.selectedId === props.state.image.id ? assets.value : assets.value?.images?.get(props.selectedId ?? ''),
);
const imageTransform = computed(() => {
  return screenshotLayerTransform(previewState.value, assets.value, props.selectedId ?? props.state.image.id)!;
});
const selections = computed(() => {
  const layers = new Map(screenshotLayers(previewState.value).map((layer) => [layer.id, layer]));
  return props.selectedIds.flatMap((id) => {
    const layer = layers.get(id);
    const t = screenshotLayerTransform(previewState.value, assets.value, id);
    return layer?.visible && !layer.locked && t && id !== elements?.editing.value?.id
      ? [
          {
            id,
            rotation: screenshotLayerRotation(props.state, id),
            rotatable: ['shape', 'arrow', 'text', 'drawing', 'cursor'].includes(layer.kind),
            style: {
              left: '0',
              top: '0',
              width: `${t.width * 100}%`,
              height: `${t.height * 100}%`,
              transform: `translate3d(${t.x * stageSize.value.width}px, ${t.y * stageSize.value.height}px, 0) rotate(${screenshotLayerRotation(props.state, id)}deg)`,
            },
          },
        ]
      : [];
  });
});
const marqueeTargets = computed<CanvasMarqueeTarget[]>(() =>
  screenshotLayers(props.state).flatMap((layer) => {
    if (!layer.visible || layer.locked || layer.opacity === 0 || ['background', 'watermark'].includes(layer.kind))
      return [];
    const transform = screenshotLayerTransform(props.state, assets.value, layer.id);
    return transform
      ? [
          {
            id: layer.id,
            x: transform.x * stageSize.value.width,
            y: transform.y * stageSize.value.height,
            width: transform.width * stageSize.value.width,
            height: transform.height * stageSize.value.height,
            rotation: screenshotLayerRotation(props.state, layer.id),
            backdrop: layer.id === props.state.image.id,
          },
        ]
      : [];
  }),
);
const paint = () => {
  if (loadedGeneration !== generation) return;
  const ctx = canvas.value?.getContext('2d');
  if (!ctx || !assets.value || !canvas.value || !available.width.value || !available.height.value) return;
  const scale = Math.min(1, 1600 / Math.max(props.state.canvas.width, props.state.canvas.height));
  const width = Math.round(props.state.canvas.width * scale),
    height = Math.round(props.state.canvas.height * scale);
  if (canvas.value.width !== width) canvas.value.width = width;
  if (canvas.value.height !== height) canvas.value.height = height;
  try {
    const state = previewState.value;
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
    else drawScreenshot(ctx, preview, assets.value, width, height, elements?.editing.value?.id);
    if (!painted) {
      painted = true;
      emit('ready');
    }
  } catch (reason) {
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
watch(
  () => [
    props.source,
    props.state.background,
    props.state.canvas.showBackground,
    props.state.canvas.watermark,
    props.state.shapes.map((c) => c.text?.style.fontAssetId),
    props.state.cursors?.map((cursor) => [cursor.selection, cursor.color, cursor.enabled]),
    props.state.images?.map((image) => image.source),
    props.cursorPacks,
    props.cursorPacksReady,
    [props.state.canvas.width, props.state.canvas.height],
  ],
  async () => {
    const current = ++generation;
    if (
      props.cursorPacksReady === false &&
      props.state.cursors?.some(
        (cursor) => cursor.enabled && !props.cursorPacks?.some((pack) => pack.id === cursor.selection.packId),
      )
    )
      return;
    try {
      const next = await loadScreenshotAssets(props.source, props.state, props.cursorPacks, loadImage);
      if (current === generation) {
        assets.value = next;
        loadedGeneration = current;
        paint();
      }
    } catch (error) {
      if (current === generation) emit('error', String(error));
    }
  },
  { immediate: true, deep: true },
);
watch(() => elements?.editing.value?.id, frames.requestRender);
watch(
  [canvas, available.width, available.height, () => props.state, () => props.cropping],
  () => {
    dragRenderer.reset();
    frames.requestRender();
  },
  {
    deep: true,
    flush: 'post',
  },
);
const layerAt = (event: MouseEvent) => {
  const rect = canvas.value!.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width,
    y = (event.clientY - rect.top) / rect.height;
  return screenshotLayerAt(props.state, assets.value, x, y);
};
const select = (event: PointerEvent) => {
  if (props.cropping || props.disabled || event.button !== 0) return;
  const id = layerAt(event);
  if (event.ctrlKey || event.metaKey || event.shiftKey) emit('select', id, 'toggle');
  else emit('select', id);
};
const editLayer = (event: MouseEvent) => {
  if (props.cropping || props.disabled || event.button !== 0 || event.ctrlKey || event.metaKey) return;
  const id = layerAt(event);
  if (!id || elements?.beginText(id)) return;
  const layer = screenshotLayers(props.state).find((candidate) => candidate.id === id);
  if (layer?.kind !== 'image' || layer.locked) return;
  emit('select', id);
  emit('cropRequest', id);
};
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
const start = (event: PointerEvent, corner?: ResizeCorner) => {
  if (props.cropping || props.disabled || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    event.stopPropagation();
    select(event);
    return;
  }
  let targetId = props.selectedId;
  if (!corner) {
    const id = layerAt(event);
    if (!id || !props.selectedIds.includes(id)) {
      event.stopPropagation();
      emit('select', id);
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
    initial: {
      ...(screenshotImage(props.state, targetId)?.transform ?? targetTransform),
    },
    corner,
    targetId: targetId ?? undefined,
    selection:
      !corner && props.selectedIds.length > 1
        ? movableScreenshotSelection(props.state, props.selectedIds).map((layer) => layer.id)
        : undefined,
  };
  if (corner && activeImage.value && activeImageAssets.value) {
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
  const dx = (event.clientX - drag.x) / drag.width,
    dy = (event.clientY - drag.y) / drag.height;
  if (drag.selection) {
    if (!translationDraft.value && !pendingTranslation && Math.hypot(dx * drag.width, dy * drag.height) < 4) return;
    pendingTranslation = constrainScreenshotTranslation(props.state, drag.selection, { x: dx, y: dy }, assets.value);
    frames.requestRender();
    return;
  }
  const effect = props.state.effects?.find((item) => item.id === props.selectedId);
  const proportionalFrame = drag.imageFrame ?? (effect && effect.shape !== 'rectangle' ? drag.initial : undefined);
  pendingTransform =
    proportionalFrame && drag.corner
      ? resizeScreenshotImage(drag.initial, proportionalFrame, dx, dy, drag.corner)
      : moveScreenshotLayer(drag.initial, dx, dy, drag.corner);
  frames.requestRender();
};
const endDrag = () => {
  flushTransform();
  if (translationDraft.value) emit('translate', translationDraft.value);
  if (transformDraft.value) emit('transform', transformDraft.value);
  const clickedId = drag?.selection && !translationDraft.value ? drag.targetId : undefined;
  translationDraft.value = null;
  transformDraft.value = null;
  if (drag) endPropertyInteraction();
  drag = null;
  dragging.value = false;
  dragRenderer.reset();
  frames.requestRender();
  if (clickedId) emit('select', clickedId);
};
watch(
  () => props.selectedIds,
  () => {
    pendingTransform = null;
    transformDraft.value = null;
    pendingTranslation = null;
    translationDraft.value = null;
    if (drag) drag.targetId = undefined;
    endDrag();
  },
);
onBeforeUnmount(() => {
  generation++;
  endDrag();
  if (rotating) {
    rotating = false;
    dragging.value = false;
    endPropertyInteraction();
  }
  frames.dispose();
});
</script>

<template>
  <div class="screenshot-stage">
    <div ref="stage" class="stage-bounds">
      <CanvasMarqueeSurface
        class="image-stage"
        :style="stageStyle"
        :targets="marqueeTargets"
        :selection="selectedIds"
        :disabled="disabled || cropping || Boolean(elements?.editing.value) || elements?.drawingMode.value"
        @select="emit('selectMany', $event)"
        @dblclick="editLayer"
      >
        <canvas ref="canvas" :aria-label="t('preview')" @pointerdown="select" />
        <CanvasLayerSelection
          v-for="selection in cropping ? [] : selections"
          :key="selection.id"
          :data-layer-id="selection.id"
          :viewport-style="{ inset: '0' }"
          :handle-style="selection.style"
          :resize-corners="selection.id === selectedId ? undefined : []"
          :rotation="selection.rotation"
          :rotatable="selection.id === selectedId && selection.rotatable"
          :rotate-label="canvasText('shapeRotation')"
          :muted="handlesMuted || (propertyInteractionActive && !dragging)"
          @pointer-down="start($event)"
          @pointer-move="move"
          @pointer-up="endDrag"
          @resize-start="(corner, event) => start(event, corner)"
          @resize-move="move"
          @resize-end="endDrag"
          @rotate-start="beginRotation"
          @rotate="rotate"
          @rotate-end="endRotation"
        />
        <ElementCanvasOverlay :viewport="{ x: 0, y: 0, ...stageSize }" :surface-size="stageSize" />
        <ScreenshotCropSelection
          v-if="cropping && activeImage && activeImageAssets"
          :state="{ ...state, image: activeImage }"
          :source-size="activeImageAssets"
          @crop="emit('crop', $event)"
          @done="emit('cropDone')"
        />
      </CanvasMarqueeSurface>
    </div>
    <div class="canvas-controls"><slot name="controls" /></div>
    <slot name="overlay" />
  </div>
</template>

<style scoped>
.screenshot-stage {
  position: relative;
  flex: 1;
  border-radius: var(--radius-lg);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}
.stage-bounds {
  position: absolute;
  inset: 36px 36px 84px;
  display: grid;
  place-items: center;
}
.image-stage {
  position: relative;
  background: repeating-conic-gradient(var(--color-bg-surface) 0% 25%, var(--color-bg-surface-hover) 0% 50%) 0 0 / 20px
    20px;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.canvas-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 20px;
  display: flex;
  justify-content: center;
}
</style>
