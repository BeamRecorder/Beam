import type { Ref } from 'vue';

export interface EditorCanvasPointerOptions {
  canvas: () => HTMLCanvasElement | null;
  container: () => HTMLDivElement | null;
  isCropping: () => boolean;
  selectedClipId: () => string | null;
  viewportZoom: {
    isPanning: Ref<boolean>;
    beginPan: (event: PointerEvent, target?: HTMLElement | null) => boolean;
    movePan: (event: PointerEvent) => void;
    endPan: (event: PointerEvent, target?: HTMLElement | null) => void;
    handleWheel: (event: WheelEvent, bounds?: DOMRect | null) => void;
  };
  cameraZoom: {
    beginSelectionMove: (event: PointerEvent) => void;
    moveSelection: (event: PointerEvent) => void;
    endSelectionMove: (event: PointerEvent) => void;
  };
  transformAndCrop: {
    selectVisualAt: (event: PointerEvent, canvas: HTMLCanvasElement | null) => boolean;
    clipIdAt: (event: PointerEvent, canvas: HTMLCanvasElement | null) => string | null;
    beginTransformDrag: (event: PointerEvent, mode: 'move') => void;
    commitCrop: () => void;
  };
  cursorInteraction: { selectAt: (event: PointerEvent) => boolean };
  onSelectClip: (clipId: string) => void;
  onDoneCrop: () => void;
}
