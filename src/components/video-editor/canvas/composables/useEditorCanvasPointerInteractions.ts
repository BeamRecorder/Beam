import type { EditorCanvasPointerOptions } from '../editor-canvas-pointer-types';

export function useEditorCanvasPointerInteractions(options: EditorCanvasPointerOptions) {
  const handleIslandPointerDown = (event: PointerEvent) => {
    if (
      !options.isManualZoom() &&
      event.button === 0 &&
      options.transformAndCrop.selectVisualAt(event, options.canvas())
    )
      return;
    if (options.viewportZoom.beginPan(event, options.container())) return;
    options.cameraZoom.beginSelectionMove(event);
  };
  const handleIslandPointerDownCapture = (event: PointerEvent) => {
    if (options.isCropping() || (event.target as Element | null)?.closest('.cursor-canvas-selection')) return;
    if (options.cursorInteraction.selectAt(event)) event.stopPropagation();
  };
  const handleTransformPointerDown = (event: PointerEvent) => {
    if (event.button === 0) {
      const clipId = options.transformAndCrop.clipIdAt(event, options.canvas());
      if (clipId && clipId !== options.selectedClipId()) {
        event.stopPropagation();
        options.onSelectClip(clipId);
        return;
      }
    }
    options.transformAndCrop.beginTransformDrag(event, 'move');
  };
  const handleIslandPointerMove = (event: PointerEvent) => {
    if (options.viewportZoom.isPanning.value) {
      options.viewportZoom.movePan(event);
      return;
    }
    options.cameraZoom.moveSelection(event);
  };
  const handleIslandPointerUp = (event: PointerEvent) => {
    if (options.viewportZoom.isPanning.value) {
      options.viewportZoom.endPan(event, options.container());
      return;
    }
    options.cameraZoom.endSelectionMove(event);
  };
  const handleIslandWheel = (event: WheelEvent) => {
    options.viewportZoom.handleWheel(event, options.container()?.getBoundingClientRect());
  };
  const commitCrop = () => {
    options.transformAndCrop.commitCrop();
    options.onDoneCrop();
  };

  return {
    commitCrop,
    handleIslandPointerDown,
    handleIslandPointerDownCapture,
    handleIslandPointerMove,
    handleIslandPointerUp,
    handleIslandWheel,
    handleTransformPointerDown,
  };
}
