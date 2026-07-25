import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { ResizeCorner } from "~/ui/ResizeHandle.vue";
import {
  type ProjectComposition,
  type MediaCompositionLayer,
  type NormalizedTransform,
  type NormalizedCrop,
  activeLayersAt,
} from "../../composition/composition-types";
import {
  computeWebcamLayout,
  webcamSettingsForAppearance,
} from "../../composition/webcam/webcam-zoom";

export interface UseLayerTransformAndCropOptions {
  composition: () => ProjectComposition;
  currentTime: () => number;
  selectedTransformLayer: () => MediaCompositionLayer | null;
  videoWindowBounds: () => {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    scale: number;
  } | null;
  isCropping: () => boolean | undefined;
  onUpdateLayerTransform: (transform: NormalizedTransform) => void;
  onUpdateLayerCrop: (crop: NormalizedCrop) => void;
  onSelectTransformLayer: (layerId: string) => void;
}

export function useLayerTransformAndCrop(
  options: UseLayerTransformAndCropOptions,
) {
  const webcamDraft = ref<NormalizedTransform | null>(null);
  let webcamDrag: {
    kind: "move" | "resize";
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    transform: NormalizedTransform;
  } | null = null;

  const cropDraft = ref<NormalizedCrop | null>(null);
  let cropDrag: {
    kind: "move" | "resize";
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    value: NormalizedCrop;
  } | null = null;

  watch(
    () => options.selectedTransformLayer()?.transform,
    () => {
      if (!webcamDrag) webcamDraft.value = null;
    },
    { deep: true },
  );

  const webcamHandleStyle = computed(() => {
    const bounds = options.videoWindowBounds();
    const layer = options.selectedTransformLayer();
    if (!bounds || !layer) return { display: "none" };

    const transform = webcamDraft.value ??
      layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };

    if (layer.reactToZoom) {
      const layout = computeWebcamLayout(
        bounds.dw,
        bounds.dh,
        bounds.scale,
        webcamSettingsForAppearance(layer.appearance ?? layer.webcamAppearance),
        transform,
      );
      return {
        left: `${bounds.dx + layout.x}px`,
        top: `${bounds.dy + layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      };
    }
    return {
      left: `${bounds.dx + transform.x * bounds.dw}px`,
      top: `${bounds.dy + transform.y * bounds.dh}px`,
      width: `${transform.width * bounds.dw}px`,
      height: `${transform.height * bounds.dh}px`,
    };
  });

  const cropValue = computed(
    () =>
      cropDraft.value ??
      options.selectedTransformLayer()?.crop ?? {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
  );

  const cropOverlayStyle = computed(() => {
    const layer = options.selectedTransformLayer();
    const bounds = options.videoWindowBounds();
    if (!options.isCropping() || !layer || !bounds) return { display: "none" };

    const transform = layer.transform ?? { x: 0, y: 0, width: 1, height: 1 };
    const layout = layer.reactToZoom
      ? computeWebcamLayout(
          bounds.dw,
          bounds.dh,
          bounds.scale,
          webcamSettingsForAppearance(
            layer.appearance ?? layer.webcamAppearance,
          ),
          transform,
        )
      : {
          x: transform.x * bounds.dw,
          y: transform.y * bounds.dh,
          width: transform.width * bounds.dw,
          height: transform.height * bounds.dh,
        };

    const crop = cropValue.value;
    return {
      left: `${bounds.dx + layout.x + crop.x * layout.width}px`,
      top: `${bounds.dy + layout.y + crop.y * layout.height}px`,
      width: `${crop.width * layout.width}px`,
      height: `${crop.height * layout.height}px`,
    };
  });

  const cropBounds = () => {
    const style = cropOverlayStyle.value;
    return {
      width: Number.parseFloat(String(style.width)) || 1,
      height: Number.parseFloat(String(style.height)) || 1,
    };
  };

  const clampCrop = (value: NormalizedCrop): NormalizedCrop => {
    const width = Math.min(1, Math.max(0.05, value.width));
    const height = Math.min(1, Math.max(0.05, value.height));
    return {
      x: Math.min(1 - width, Math.max(0, value.x)),
      y: Math.min(1 - height, Math.max(0, value.y)),
      width,
      height,
    };
  };

  const beginCropDrag = (
    event: PointerEvent,
    kind: "move" | "resize",
    corner?: ResizeCorner,
  ) => {
    cropDrag = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      value: { ...cropValue.value },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveCropDrag = (event: PointerEvent) => {
    if (!cropDrag) return;
    const bounds = cropBounds();
    const dx =
      ((event.clientX - cropDrag.startX) / bounds.width) * cropDrag.value.width;
    const dy =
      ((event.clientY - cropDrag.startY) / bounds.height) *
      cropDrag.value.height;

    if (cropDrag.kind === "move") {
      cropDraft.value = clampCrop({
        ...cropDrag.value,
        x: cropDrag.value.x + dx,
        y: cropDrag.value.y + dy,
      });
    } else {
      const left = cropDrag.corner?.includes("left");
      const top = cropDrag.corner?.includes("top");
      const width = cropDrag.value.width + (left ? -dx : dx);
      const height = cropDrag.value.height + (top ? -dy : dy);
      cropDraft.value = clampCrop({
        x: left
          ? cropDrag.value.x + cropDrag.value.width - width
          : cropDrag.value.x,
        y: top
          ? cropDrag.value.y + cropDrag.value.height - height
          : cropDrag.value.y,
        width,
        height,
      });
    }
  };

  const endCropDrag = (event: PointerEvent) => {
    if (cropDraft.value) options.onUpdateLayerCrop(cropDraft.value);
    cropDraft.value = null;
    cropDrag = null;
    if (
      (event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)
    ) {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }
  };

  const beginWebcamDrag = (
    event: PointerEvent,
    kind: "move" | "resize",
    corner?: ResizeCorner,
  ) => {
    const layer = options.selectedTransformLayer();
    if (!layer?.transform) return;
    event.stopPropagation();
    webcamDraft.value = { ...layer.transform };
    webcamDrag = {
      kind,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      transform: { ...layer.transform },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const applyWebcamDrag = (
    clientX: number,
    clientY: number,
    shiftKey: boolean,
  ) => {
    const bounds = options.videoWindowBounds();
    if (!webcamDrag || !bounds) return;
    webcamDrag.lastX = clientX;
    webcamDrag.lastY = clientY;
    const dx = (clientX - webcamDrag.startX) / bounds.dw;
    const dy = (clientY - webcamDrag.startY) / bounds.dh;
    const initial = webcamDrag.transform;

    if (webcamDrag.kind === "move") {
      webcamDraft.value = {
        ...initial,
        x: Math.min(1 - initial.width, Math.max(0, initial.x + dx)),
        y: Math.min(1 - initial.height, Math.max(0, initial.y + dy)),
      };
      return;
    }

    const left = webcamDrag.corner?.includes("left");
    const top = webcamDrag.corner?.includes("top");
    const rawWidth = initial.width + (left ? -dx : dx);
    const rawHeight = initial.height + (top ? -dy : dy);
    const ratio = initial.height / initial.width;
    const width = Math.min(0.9, Math.max(0.08, rawWidth));
    const height = Math.min(
      0.9,
      Math.max(0.08, shiftKey ? rawHeight : width * ratio),
    );

    webcamDraft.value = {
      x: Math.min(
        1 - width,
        Math.max(0, left ? initial.x + initial.width - width : initial.x),
      ),
      y: Math.min(
        1 - height,
        Math.max(0, top ? initial.y + initial.height - height : initial.y),
      ),
      width,
      height,
    };
  };

  const moveWebcamDrag = (event: PointerEvent) =>
    applyWebcamDrag(event.clientX, event.clientY, event.shiftKey);

  const updateWebcamAspectMode = (event: KeyboardEvent) => {
    if (event.key === "Shift" && webcamDrag) {
      applyWebcamDrag(
        webcamDrag.lastX,
        webcamDrag.lastY,
        event.type === "keydown",
      );
    }
  };

  const endWebcamDrag = (event: PointerEvent) => {
    if (!webcamDrag) return;
    if (webcamDraft.value) options.onUpdateLayerTransform(webcamDraft.value);
    webcamDrag = null;
    if (
      (event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)
    ) {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    }
  };

  const selectWebcamAt = (
    event: PointerEvent,
    canvas: HTMLCanvasElement | null,
  ) => {
    const bounds = options.videoWindowBounds();
    if (!canvas || !bounds) return false;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left - bounds.dx;
    const y = event.clientY - rect.top - bounds.dy;
    const layers = activeLayersAt(
      options.composition(),
      options.currentTime() * 1000,
    ).filter(
      (layer): layer is MediaCompositionLayer =>
        layer.kind !== "audio" &&
        layer.kind !== "caption" &&
        Boolean(layer.transform),
    );

    for (const layer of [...layers].reverse()) {
      const layout = layer.reactToZoom
        ? computeWebcamLayout(
            bounds.dw,
            bounds.dh,
            bounds.scale,
            webcamSettingsForAppearance(
              layer.appearance ?? layer.webcamAppearance,
            ),
            layer.transform!,
          )
        : {
            x: layer.transform!.x * bounds.dw,
            y: layer.transform!.y * bounds.dh,
            width: layer.transform!.width * bounds.dw,
            height: layer.transform!.height * bounds.dh,
          };

      if (
        x >= layout.x &&
        x <= layout.x + layout.width &&
        y >= layout.y &&
        y <= layout.y + layout.height
      ) {
        options.onSelectTransformLayer(layer.id);
        return true;
      }
    }
    return false;
  };

  onMounted(() => {
    window.addEventListener("keydown", updateWebcamAspectMode);
    window.addEventListener("keyup", updateWebcamAspectMode);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", updateWebcamAspectMode);
    window.removeEventListener("keyup", updateWebcamAspectMode);
  });

  return {
    webcamDraft,
    cropDraft,
    webcamHandleStyle,
    cropOverlayStyle,
    beginWebcamDrag,
    moveWebcamDrag,
    endWebcamDrag,
    beginCropDrag,
    moveCropDrag,
    endCropDrag,
    selectWebcamAt,
  };
}
