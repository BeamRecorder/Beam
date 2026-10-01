import { afterEach, expect, it, vi } from 'vitest';
import { createRafReveal } from './raf-reveal';
import type { RevealAxis, RevealRuntime } from './raf-reveal-types';
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const harness = (gap = 12, axis: RevealAxis = 'vertical') => {
  let time = 0,
    nextId = 0,
    reduced = false;
  const frames = new Map<number, FrameRequestCallback>();
  const runtime: RevealRuntime = {
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: vi.fn((id) => {
      frames.delete(id);
    }),
    now: () => time,
    reducedMotion: () => reduced,
  };
  const parent = document.createElement('div');
  parent.style.cssText = `display:grid;row-gap:${gap}px;column-gap:${gap}px`;
  const node = document.createElement('div');
  node.style.cssText =
    'height:100px;width:300px;padding:8px 4px;border:1px solid;opacity:1;margin:2px 0;overflow:visible';
  parent.append(node);
  document.body.append(parent);
  vi.spyOn(node, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        height: Number.parseFloat(node.style.height) || 0,
        width: Number.parseFloat(node.style.width) || 0,
      }) as DOMRect,
  );
  const reveal = createRafReveal(runtime, axis);
  return {
    node,
    reveal,
    runtime,
    frames,
    reduced: () => {
      reduced = true;
    },
    step: (ms: number) => {
      time += ms;
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback(time));
    },
  };
};
it('opens and closes with the same curve, compensates parent gaps and restores styles', () => {
  const h = harness(),
    original = {
      height: h.node.style.height,
      padding: h.node.style.padding,
      margin: h.node.style.margin,
      opacity: h.node.style.opacity,
      overflow: h.node.style.overflow,
    },
    opened = vi.fn(),
    closed = vi.fn();
  h.reveal.enter(h.node, opened);
  expect(h.node.style.height).toBe('0px');
  expect(h.node.style.marginBottom).toBe('-12px');
  h.step(100);
  expect(h.node.style.height).toBe('50px');
  expect(h.node.style.opacity).toBe('0.5');
  expect(h.node.style.paddingTop).toBe('4px');
  expect(opened).not.toHaveBeenCalled();
  h.step(100);
  expect(opened).toHaveBeenCalledOnce();
  expect(Object.fromEntries(Object.keys(original).map((key) => [key, h.node.style[key as 'height']]))).toEqual(
    original,
  );
  expect(h.frames.size).toBe(0);
  h.reveal.leave(h.node, closed);
  h.step(100);
  expect(h.node.style.height).toBe('50px');
  expect(h.node.style.marginBottom).toBe('-5px');
  h.step(100);
  expect(closed).toHaveBeenCalledOnce();
  expect(Object.fromEntries(Object.keys(original).map((key) => [key, h.node.style[key as 'height']]))).toEqual(
    original,
  );
  expect(h.frames.size).toBe(0);
});
it('reveals horizontal panels without changing their height and compensates the workspace gap', () => {
  const h = harness(12, 'horizontal');
  const styles = () =>
    Object.fromEntries(
      [
        'width',
        'height',
        'padding',
        'margin',
        'borderLeftWidth',
        'borderRightWidth',
        'opacity',
        'overflow',
        'willChange',
        'minWidth',
        'boxSizing',
      ].map((key) => [key, h.node.style[key as 'width']]),
    );
  const original = styles();
  const opened = vi.fn(),
    closed = vi.fn();
  h.reveal.enter(h.node, opened);
  expect(h.node.style.width).toBe('0px');
  expect(h.node.style.height).toBe('100px');
  expect(h.node.style.marginRight).toBe('-12px');
  expect(h.node.style.willChange).toBe('width, opacity');
  h.step(100);
  expect(h.node.style.width).toBe('150px');
  expect(h.node.style.opacity).toBe('0.5');
  expect(h.node.style.paddingLeft).toBe('2px');
  expect(h.node.style.borderLeftWidth).toBe('0.5px');
  h.step(100);
  expect(styles()).toEqual(original);
  expect(opened).toHaveBeenCalledOnce();
  h.reveal.leave(h.node, closed);
  h.step(100);
  expect(h.node.style.width).toBe('150px');
  h.step(100);
  expect(closed).toHaveBeenCalledOnce();
  expect(styles()).toEqual(original);
});
it('reverses horizontal changes at their current width and honors reduced motion', () => {
  const h = harness(12, 'horizontal');
  h.reveal.leave(h.node, vi.fn());
  h.step(70);
  const width = h.node.style.width;
  const done = vi.fn();
  h.reveal.enter(h.node, done);
  expect(h.node.style.width).toBe(width);
  expect(h.frames.size).toBe(1);
  h.step(50);
  expect(Number.parseFloat(h.node.style.width)).toBeGreaterThan(Number.parseFloat(width));
  h.reduced();
  h.step(1);
  expect(done).toHaveBeenCalledOnce();
  expect(h.node.style.width).toBe('300px');
  expect(h.frames.size).toBe(0);
  h.reveal.leave(h.node, done);
  expect(done).toHaveBeenCalledTimes(2);
});
it('compensates horizontal row gaps without affecting a column layout', () => {
  for (const direction of ['row', 'row-reverse', 'column']) {
    const h = harness(12, 'horizontal');
    h.node.parentElement!.style.display = 'flex';
    h.node.parentElement!.style.flexDirection = direction;
    h.reveal.enter(h.node, vi.fn());
    expect(h.node.style.marginRight).toBe(direction.startsWith('row') ? '-12px' : '0px');
    h.reveal.dispose();
    expect(h.node.style.width).toBe('300px');
    expect(h.frames.size).toBe(0);
  }
});
it('reverses quick toggles from the current height and cancels old frame zero', () => {
  const h = harness(0),
    first = vi.fn(),
    second = vi.fn(),
    third = vi.fn();
  h.reveal.enter(h.node, first);
  h.reveal.cancel(h.node);
  expect(h.runtime.cancelFrame).toHaveBeenCalledWith(0);
  h.reveal.enter(h.node, second);
  h.step(50);
  const height = h.node.style.height;
  h.reveal.leave(h.node, third);
  expect(h.node.style.height).toBe(height);
  h.step(100);
  expect(Number.parseFloat(h.node.style.height)).toBeLessThan(Number.parseFloat(height));
  h.reveal.enter(h.node, first);
  h.step(200);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(third).not.toHaveBeenCalled();
  expect(h.frames.size).toBe(0);
});
it('uses immediate changes for reduced motion, including a preference change during animation', () => {
  const h = harness(),
    done = vi.fn();
  h.reduced();
  h.reveal.enter(h.node, done);
  h.reveal.leave(h.node, done);
  expect(done).toHaveBeenCalledTimes(2);
  expect(h.frames.size).toBe(0);
  const active = harness();
  active.reveal.enter(active.node, done);
  active.step(30);
  active.reduced();
  active.step(1);
  expect(done).toHaveBeenCalledTimes(3);
  expect(active.frames.size).toBe(0);
});
it('cleans up multiple animations on disposal and ignores unrelated cancellation', () => {
  const h = harness(),
    other = document.createElement('div');
  other.style.height = '20px';
  h.reveal.cancel(other);
  h.reveal.enter(h.node, vi.fn());
  h.reveal.leave(other, vi.fn());
  expect(h.frames.size).toBe(2);
  h.reveal.dispose();
  expect(h.frames.size).toBe(0);
  expect(h.node.style.overflow).toBe('visible');
  expect(other.style.height).toBe('20px');
  h.reveal.dispose();
});
it('handles a detached zero-height panel and clamps early or late frame times', () => {
  const h = harness(),
    detached = document.createElement('div'),
    done = vi.fn();
  h.reveal.enter(detached, done);
  h.step(-10);
  expect(detached.style.height).toBe('0px');
  h.step(400);
  expect(done).toHaveBeenCalledOnce();
  expect(detached.style.height).toBe('');
});
it('compensates column gaps but keeps row-layout margins intact', () => {
  for (const direction of ['column', 'row']) {
    const h = harness();
    h.node.parentElement!.style.display = 'flex';
    h.node.parentElement!.style.flexDirection = direction;
    h.reveal.enter(h.node, vi.fn());
    expect(h.node.style.marginBottom).toBe(direction === 'column' ? '-12px' : '0px');
    h.reveal.dispose();
  }
});
it('continues a forced Vue v-if replacement at the interrupted height and releases its old frame', () => {
  const h = harness();
  const replacement = document.createElement('div');
  replacement.style.height = '120px';
  vi.spyOn(replacement, 'getBoundingClientRect').mockImplementation(
    () => ({ height: Number.parseFloat(replacement.style.height) }) as DOMRect,
  );
  h.reveal.afterLeave(replacement);
  h.reveal.leave(h.node, vi.fn());
  h.step(50);
  const interruptedHeight = h.node.style.height;
  h.reveal.afterLeave(h.node);
  expect(h.frames.size).toBe(0);
  const done = vi.fn();
  h.reveal.enter(replacement, done);
  expect(replacement.style.height).toBe(interruptedHeight);
  h.step(200);
  expect(done).toHaveBeenCalledOnce();
  expect(replacement.style.height).toBe('120px');
});
