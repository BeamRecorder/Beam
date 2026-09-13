import { createTimelineIntervalIndex } from '../shared/timeline-interval-index';
import type { PreviewQuality } from './playback-preview';
import {
  activeAt,
  createPlaybackSink,
  PLAYBACK_TICK_PRELOAD_SECONDS,
  type ClipConsumer,
} from './playback-worker-consumers';

/** Keeps decoded surfaces bounded by the visible clips and the existing lookahead. */
export class PlaybackConsumerWindow {
  readonly resident = new Set<ClipConsumer>();
  private revision = 0;
  private order = new Map<ClipConsumer, number>();
  private activeAt = createTimelineIntervalIndex<ClipConsumer>([]);
  private preloadedAt = createTimelineIntervalIndex<ClipConsumer>([]);

  rebuild(consumers: Iterable<ClipConsumer>) {
    this.revision += 1;
    const entries = [...consumers];
    this.order = new Map(entries.map((consumer, index) => [consumer, index]));
    const intervals = entries.map((consumer) => ({
      start: consumer.clip.timelineStartSeconds,
      end: consumer.clip.timelineStartSeconds + consumer.clip.timelineDurationSeconds,
      value: consumer,
    }));
    this.activeAt = createTimelineIntervalIndex(intervals);
    this.preloadedAt = createTimelineIntervalIndex(
      intervals.map((interval) => ({ ...interval, start: interval.start - PLAYBACK_TICK_PRELOAD_SECONDS })),
    );
    for (const consumer of this.resident) if (!this.order.has(consumer)) this.resident.delete(consumer);
  }

  select(time: number, preload = false) {
    const candidates = preload ? this.preloadedAt(time) : this.activeAt(time);
    return candidates
      .filter((consumer) => {
        const startsIn = consumer.clip.timelineStartSeconds - time;
        return activeAt(consumer.clip, time) || (preload && startsIn > 0 && startsIn <= PLAYBACK_TICK_PRELOAD_SECONDS);
      })
      .sort((left, right) => this.order.get(left)! - this.order.get(right)!);
  }

  async prepare(
    active: ClipConsumer[],
    reset: (consumer: ClipConsumer) => Promise<void>,
    quality: PreviewQuality,
    resetActive = false,
  ) {
    const revision = this.revision;
    const keep = new Set(active);
    await Promise.all(
      [...this.resident].map(async (consumer) => {
        if (keep.has(consumer)) {
          if (resetActive && (consumer.iterator || consumer.queue.length)) await reset(consumer);
          return;
        }
        await reset(consumer);
        if (revision !== this.revision) return;
        // CanvasSink has no public disposal API. Replacing it releases the old
        // canvas pool for collection; the new sink allocates surfaces on first use.
        consumer.sink = createPlaybackSink(consumer.asset, quality);
        this.resident.delete(consumer);
      }),
    );
    if (revision !== this.revision) return;
    for (const consumer of active) this.resident.add(consumer);
  }

  clear() {
    this.resident.clear();
    this.rebuild([]);
  }
}
