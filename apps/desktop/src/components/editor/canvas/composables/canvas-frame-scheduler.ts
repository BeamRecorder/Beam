export interface CanvasFrameScheduler {
  requestRender: () => void;
  dispose: () => void;
}

export function createCanvasFrameScheduler(
  render: () => void,
  shouldContinue: () => boolean,
  enabled: () => boolean = () => true,
  maxFrameRate: () => number = () => 0,
): CanvasFrameScheduler {
  let animationFrameId: number | null = null;
  let isRendering = false;
  let renderRequestedDuringFrame = false;
  let disposed = false;
  let frameClock: number | null = null;

  const requestRender = () => {
    if (disposed || !enabled()) return;
    if (isRendering) {
      renderRequestedDuringFrame = true;
      return;
    }
    if (animationFrameId === null) animationFrameId = requestAnimationFrame(drawFrame);
  };

  function drawFrame(timestamp: number) {
    animationFrameId = null;
    if (!enabled()) {
      frameClock = null;
      return;
    }
    const limit = maxFrameRate();
    if (limit > 0) {
      const period = 1000 / limit;
      if (frameClock !== null) {
        // Match the Pixi ticker cap used by Recordly, retaining the fractional cadence remainder.
        const delta = (timestamp - frameClock) | 0;
        if (delta < period) {
          requestRender();
          return;
        }
        frameClock = timestamp - (delta % period);
      } else frameClock = timestamp;
    } else frameClock = null;
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
