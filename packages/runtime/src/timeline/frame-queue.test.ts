// @vitest-environment node
import { expect, it } from 'vitest';
import { createTimelineFrameQueue } from './frame-queue';
function setup() {
  const frames = new Map<number, (time: number) => void>();
  let id = 0;
  const queue = createTimelineFrameQueue({
    request(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancel(key) {
      frames.delete(key);
    },
  });
  const flush = () => {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((callback) => callback(42));
  };
  return { queue, frames, flush };
}
it('coalesces work and paints after measurements, including paint scheduled by a measurement', () => {
  const { queue, frames, flush } = setup(),
    order: string[] = [];
  queue.request('paint', () => order.push('paint'));
  queue.request('measure', (time) => {
    expect(time).toBe(42);
    order.push('measure');
    queue.request('paint', () => order.push('new paint'));
  });
  expect(frames.size).toBe(1);
  flush();
  expect(order).toEqual(['measure', 'paint', 'new paint']);
  expect(frames.size).toBe(0);
});
it('defers work requested in its own phase and cancels individual callbacks', () => {
  const { queue, frames, flush } = setup(),
    order: number[] = [];
  const cancelled = queue.request('paint', () => order.push(99));
  queue.cancel(cancelled);
  expect(frames.size).toBe(0);
  queue.request('paint', () => {
    order.push(1);
    queue.request('paint', () => order.push(2));
  });
  flush();
  expect(order).toEqual([1]);
  expect(frames.size).toBe(1);
  flush();
  expect(order).toEqual([1, 2]);
});
it('finishes independent work on errors, aggregates failures and disposes pending work', () => {
  const { queue, frames, flush } = setup();
  let completed = false;
  queue.request('measure', () => {
    throw new Error('one');
  });
  queue.request('paint', () => {
    completed = true;
  });
  expect(flush).toThrow('one');
  expect(completed).toBe(true);
  queue.request('paint', () => {
    throw new Error('two');
  });
  queue.request('paint', () => {
    throw new Error('three');
  });
  expect(flush).toThrow(AggregateError);
  queue.request('paint', () => {});
  queue.dispose();
  queue.dispose();
  expect(frames.size).toBe(0);
  expect(() => queue.request('paint', () => {})).toThrow('disposed');
});
