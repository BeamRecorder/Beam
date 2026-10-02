import { createTimelineFrameQueue } from './frame-queue';

/** Browser methods keep their Window receiver; other hosts inject their own clock. */
export function createBrowserTimelineFrameQueue() {
  return createTimelineFrameQueue({
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  });
}
