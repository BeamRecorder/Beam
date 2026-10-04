import { computed, watch } from 'vue';
import type { Ref } from 'vue';
import type { ScreenshotCanvasProps } from './screenshot-canvas-contract-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import type { CanvasMarqueeTarget } from '../editor/canvas/canvas-marquee-types';
import type { NormalizedTransform } from '@beam/engine/shared/composition-types';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { layerPerspectiveDistance } from '@beam/engine/layout/layer-perspective';
import { screenshotLayerTransform, screenshotLayerRotation, screenshotLayerBounds } from './screenshot-layer-geometry';
export function useScreenshotCanvasGeometry(
  props: ScreenshotCanvasProps,
  previewState: Ref<ScreenshotState>,
  assets: Ref<ScreenshotRenderAssets | null>,
  stageSize: Ref<{ width: number; height: number }>,
  editingId: () => string | undefined,
  onSelectionBounds: (value: NormalizedTransform | null) => void,
) {
  const selections = computed(() => {
    const layers = new Map(screenshotLayers(previewState.value).map((layer) => [layer.id, layer]));
    return props.selectedIds.flatMap((id) => {
      const layer = layers.get(id);
      const t = screenshotLayerTransform(previewState.value, assets.value, id);
      return layer?.kind !== 'zoom' && layer?.visible && !layer.locked && t && id !== editingId()
        ? [
            {
              id,
              rotation: screenshotLayerRotation(props.state, id),
              rotatable: ['image', 'shape', 'arrow', 'text', 'drawing', 'cursor'].includes(layer.kind),
              style: {
                left: '0',
                top: '0',
                width: `${t.width * 100}%`,
                height: `${t.height * 100}%`,
                transform: `translate3d(${t.x * stageSize.value.width}px, ${t.y * stageSize.value.height}px, 0) ${layer.rotation3d ? `perspective(${(layerPerspectiveDistance({ x: 0, y: 0, width: t.width * props.state.canvas.width, height: t.height * props.state.canvas.height }, layer.rotation3d.perspective) * stageSize.value.width) / props.state.canvas.width}px) rotateY(${layer.rotation3d.y}deg) rotateX(${layer.rotation3d.x}deg)` : ''} rotate(${screenshotLayerRotation(props.state, id)}deg)`,
              },
            },
          ]
        : [];
    });
  });
  const selectionBounds = computed(() => {
    if (
      props.selectedIds.length < 2 ||
      screenshotLayers(props.state).some(
        (r) => props.selectedIds.includes(r.id) && (r.locked || ['background', 'watermark', 'zoom'].includes(r.kind)),
      )
    )
      return null;
    const rects = props.selectedIds.flatMap((id) => {
      const rect = screenshotLayerBounds(previewState.value, assets.value, id);
      return rect ? [rect] : [];
    });
    if (rects.length < 2) return null;
    const x = Math.min(...rects.map((r) => r.x)),
      y = Math.min(...rects.map((r) => r.y));
    return {
      x,
      y,
      width: Math.max(...rects.map((r) => r.x + r.width)) - x,
      height: Math.max(...rects.map((r) => r.y + r.height)) - y,
    };
  });
  watch(selectionBounds, onSelectionBounds, { immediate: true });
  const marqueeTargets = computed<CanvasMarqueeTarget[]>(() =>
    screenshotLayers(props.state).flatMap((layer) => {
      if (!layer.visible || layer.locked || layer.opacity === 0 || ['background', 'watermark'].includes(layer.kind))
        return [];
      const transform = screenshotLayerBounds(props.state, assets.value, layer.id);
      return transform
        ? [
            {
              id: layer.id,
              x: transform.x * stageSize.value.width,
              y: transform.y * stageSize.value.height,
              width: transform.width * stageSize.value.width,
              height: transform.height * stageSize.value.height,
              backdrop: layer.id === props.state.image.id,
            },
          ]
        : [];
    }),
  );

  const editingRotation3d = computed(() => {
    const value = props.state.composition?.find((r) => r.id === editingId())?.rotation3d;
    return value
      ? { ...value, perspective: (value.perspective * stageSize.value.width) / props.state.canvas.width }
      : undefined;
  });
  return { selections, selectionBounds, marqueeTargets, editingRotation3d };
}
