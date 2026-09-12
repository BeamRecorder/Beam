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
import type { ScreenshotDrag, ScreenshotRenderAssets } from './screenshot-types';
import { screenshotLayerAt, screenshotLayerTransform, screenshotLayerRotation } from './screenshot-layer-geometry';
import { screenshotLayers } from './screenshot-layers';
import { createScreenshotImageLoader } from './screenshot-assets';

const { t } = useTranslate('ScreenshotEditor');
const elements = useElementEditor();
const props = defineProps<{
  source: string;
  state: ScreenshotState;
  selectedId: string | null;
  cropping?: boolean;
  cursorPacks?: CursorPackDescriptor[];
  cursorPacksReady?: boolean;
  handlesMuted?: boolean;
}>();
const emit = defineEmits<{
  select: [id: string | null];
  transform: [value: NormalizedTransform];
  error: [message: string];
  ready: [];
  crop: [value: NormalizedCrop];
  cropDone: [];
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
const dragging = ref(false);
const dragRenderer = createScreenshotDragRenderer();
const transformDraft = shallowRef<NormalizedTransform | null>(null);
let pendingTransform: NormalizedTransform | null = null;
const flushTransform = () => {
  if (!pendingTransform) return;
  transformDraft.value = pendingTransform;
  pendingTransform = null;
};
const previewState = computed(() =>
  props.selectedId && transformDraft.value
    ? withScreenshotTransform(props.state, props.selectedId, transformDraft.value, assets.value)
    : props.state,
);
const activeImage = computed(() => screenshotImage(previewState.value, props.selectedId));
const activeImageAssets = computed(() =>
  props.selectedId === props.state.image.id ? assets.value : assets.value?.images?.get(props.selectedId ?? ''),
);
const selected = computed(() => screenshotLayers(props.state).find((layer) => layer.id === props.selectedId));
const imageTransform = computed(() => {
  return screenshotLayerTransform(previewState.value, assets.value, props.selectedId ?? props.state.image.id)!;
});
const selectedTransform = computed(() =>
  props.selectedId ? screenshotLayerTransform(previewState.value, assets.value, props.selectedId) : null,
);
const style = computed(() => {
  const t = selectedTransform.value;
  return t
    ? {
        left: '0',
        top: '0',
        width: `${t.width * 100}%`,
        height: `${t.height * 100}%`,
        transform: `translate3d(${t.x * stageSize.value.width}px, ${t.y * stageSize.value.height}px, 0) rotate(${screenshotLayerRotation(props.state, props.selectedId!)}deg)`,
      }
    : {};
});
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
      dragRenderer.draw(ctx, preview, assets.value, width, height, props.selectedId, elements?.editing.value?.id);
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
  if (!props.cropping) emit('select', layerAt(event));
};
const editText = (event: MouseEvent) => {
  if (props.cropping || event.button !== 0) return;
  const id = layerAt(event);
  if (id) elements?.beginText(id);
};
const start = (event: PointerEvent, corner?: ResizeCorner) => {
  if (!selected.value || !selectedTransform.value || selected.value.locked || event.button !== 0) return;
  if (!corner) {
    const id = layerAt(event);
    if (id !== props.selectedId) {
      event.stopPropagation();
      emit('select', id);
      return;
    }
  }
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
      ...(activeImage.value?.transform ?? selectedTransform.value),
    },
    corner,
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
  pendingTransform =
    drag.imageFrame && drag.corner
      ? resizeScreenshotImage(drag.initial, drag.imageFrame, dx, dy, drag.corner)
      : moveScreenshotLayer(drag.initial, dx, dy, drag.corner);
  frames.requestRender();
};
const endDrag = () => {
  flushTransform();
  if (transformDraft.value) emit('transform', transformDraft.value);
  transformDraft.value = null;
  if (drag) endPropertyInteraction();
  drag = null;
  dragging.value = false;
  dragRenderer.reset();
  frames.requestRender();
};
watch(
  () => props.selectedId,
  () => {
    pendingTransform = null;
    transformDraft.value = null;
    endDrag();
  },
);
onBeforeUnmount(() => {
  generation++;
  endDrag();
  frames.dispose();
});
</script>

<template>
  <div class="screenshot-stage">
    <div ref="stage" class="stage-bounds">
      <div class="image-stage" :style="stageStyle" @dblclick="editText">
        <canvas ref="canvas" :aria-label="t('preview')" @pointerdown="select" />
        <CanvasLayerSelection
          v-if="
            selected?.visible &&
            !selected.locked &&
            selectedTransform &&
            !cropping &&
            selected.id !== elements?.editing.value?.id
          "
          :viewport-style="{ inset: '0' }"
          :handle-style="style"
          :muted="handlesMuted || (propertyInteractionActive && !dragging)"
          @pointer-down="start($event)"
          @pointer-move="move"
          @pointer-up="endDrag"
          @resize-start="(corner, event) => start(event, corner)"
          @resize-move="move"
          @resize-end="endDrag"
        />
        <ElementCanvasOverlay :viewport="{ x: 0, y: 0, ...stageSize }" :surface-size="stageSize" />
        <ScreenshotCropSelection
          v-if="cropping && activeImage && activeImageAssets"
          :state="{ ...state, image: activeImage }"
          :source-size="activeImageAssets"
          @crop="emit('crop', $event)"
          @done="emit('cropDone')"
        />
      </div>
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
