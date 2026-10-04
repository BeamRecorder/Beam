export interface CanvasFrameScheduler {
  requestRender: () => void;
  dispose: () => void;
}

export function createCanvasFrameScheduler(render: () => void, shouldContinue: () => boolean): CanvasFrameScheduler {
  let animationFrameId: number | null = null;
  let isRendering = false;
  let renderRequestedDuringFrame = false;
  let disposed = false;

  const requestRender = () => {
    if (disposed) return;
    if (isRendering) {
      renderRequestedDuringFrame = true;
      return;
    }
    if (animationFrameId === null) animationFrameId = requestAnimationFrame(drawFrame);
  };

  function drawFrame() {
    animationFrameId = null;
    isRendering = true;
    renderRequestedDuringFrame = false;
    try {
      render();
    } finally {
      isRendering = false;
    }
    if (shouldContinue() || renderRequestedDuringFrame) requestRender();
  }

  const dispose = () => {
    disposed = true;
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    renderRequestedDuringFrame = false;
  };

  return { requestRender, dispose };
}
