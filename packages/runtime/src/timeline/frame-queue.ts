import type { TimelineFrameHost, TimelineFrameQueue } from './frame-queue-types';

/** Measurements run before painting in the same physical frame; idle timelines own no clock. */
export function createTimelineFrameQueue(host: TimelineFrameHost): TimelineFrameQueue {
  const work = new Map<number, { phase: 'measure' | 'paint'; callback: (time: number) => void }>();
  let sequence = 0,
    frame: number | null = null,
    running = false,
    disposed = false;
  const schedule = () => {
    if (!running && !disposed && frame === null && work.size) frame = host.request(flush);
  };
  const flush = (time: number) => {
    frame = null;
    running = true;
    const errors: unknown[] = [];
    try {
      for (const phase of ['measure', 'paint'] as const) {
        const batch = [...work].filter(([, item]) => item.phase === phase);
        for (const [id, item] of batch) {
          if (!work.delete(id)) continue;
          try {
            item.callback(time);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    } finally {
      running = false;
      schedule();
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Timeline frame failed.');
  };
  return {
    request(phase, callback) {
      if (disposed) throw new Error('Timeline frame queue disposed.');
      const id = ++sequence;
      work.set(id, { phase, callback });
      schedule();
      return id;
    },
    cancel(id) {
      work.delete(id);
      if (!work.size && frame !== null) {
        host.cancel(frame);
        frame = null;
      }
    },
    dispose() {
      disposed = true;
      work.clear();
      if (frame !== null) host.cancel(frame);
      frame = null;
    },
  };
}
