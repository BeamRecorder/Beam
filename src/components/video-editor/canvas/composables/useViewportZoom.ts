import { computed, onMounted, onUnmounted, ref } from "vue";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5.0;

export function useViewportZoom() {
  const zoomScale = ref(1.0);
  const panX = ref(0);
  const panY = ref(0);
  const isPanning = ref(false);
  const isSpacePressed = ref(false);

  let panDrag: {
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null = null;

  const zoomPercent = computed(() => Math.round(zoomScale.value * 100));
  const isZoomedOrPanned = computed(() => zoomScale.value !== 1.0 || panX.value !== 0 || panY.value !== 0);

  const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));

  const setZoomScale = (targetScale: number, focalX?: number, focalY?: number) => {
    const nextScale = clampZoom(targetScale);
    const prevScale = zoomScale.value;
    if (nextScale === prevScale) return;

    if (focalX !== undefined && focalY !== undefined) {
      const ratio = nextScale / prevScale;
      panX.value = focalX - (focalX - panX.value) * ratio;
      panY.value = focalY - (focalY - panY.value) * ratio;
    }
    zoomScale.value = nextScale;
  };

  const zoomIn = () => setZoomScale(zoomScale.value * 1.25);
  const zoomOut = () => setZoomScale(zoomScale.value / 1.25);

  const resetZoom = () => {
    zoomScale.value = 1.0;
    panX.value = 0;
    panY.value = 0;
  };

  const handleWheel = (event: WheelEvent, containerRect?: DOMRect | null) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = clampZoom(zoomScale.value * factor);

    if (containerRect) {
      const focalX = event.clientX - containerRect.left;
      const focalY = event.clientY - containerRect.top;
      setZoomScale(nextScale, focalX, focalY);
    } else {
      setZoomScale(nextScale);
    }
  };

  const shouldHandlePan = (event: PointerEvent): boolean => {
    return event.button === 1 || isSpacePressed.value;
  };

  const beginPan = (event: PointerEvent, targetElement?: HTMLElement | null): boolean => {
    if (!shouldHandlePan(event)) return false;

    event.preventDefault();
    event.stopPropagation();
    isPanning.value = true;
    panDrag = {
      startX: event.clientX,
      startY: event.clientY,
      initialPanX: panX.value,
      initialPanY: panY.value,
    };
    if (targetElement) targetElement.setPointerCapture(event.pointerId);
    return true;
  };

  const movePan = (event: PointerEvent) => {
    if (!isPanning.value || !panDrag) return;
    panX.value = panDrag.initialPanX + (event.clientX - panDrag.startX);
    panY.value = panDrag.initialPanY + (event.clientY - panDrag.startY);
  };

  const endPan = (event: PointerEvent, targetElement?: HTMLElement | null) => {
    if (!isPanning.value) return;
    isPanning.value = false;
    panDrag = null;
    if (targetElement?.hasPointerCapture(event.pointerId)) {
      targetElement.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space" || event.key === " ") {
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (["input", "textarea", "select"].includes(tag) || active.getAttribute("contenteditable") === "true") {
          return;
        }
      }
      isSpacePressed.value = true;
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space" || event.key === " ") {
      isSpacePressed.value = false;
    }
  };

  onMounted(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  });

  const viewportStyle = computed(() => ({
    transform: `translate3d(${panX.value}px, ${panY.value}px, 0) scale(${zoomScale.value})`,
    transformOrigin: "0 0",
    width: "100%",
    height: "100%",
    position: "absolute" as const,
    top: 0,
    left: 0,
  }));

  return {
    zoomScale,
    zoomPercent,
    panX,
    panY,
    isPanning,
    isSpacePressed,
    isZoomedOrPanned,
    viewportStyle,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomScale,
    handleWheel,
    shouldHandlePan,
    beginPan,
    movePan,
    endPan,
  };
}
