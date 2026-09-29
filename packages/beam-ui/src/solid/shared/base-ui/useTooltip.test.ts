import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useTooltip } from './useTooltip';

const disposers: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.useRealTimers();
});
function mount(delay?: number) {
  return createRoot(dispose => {
    disposers.push(dispose);
    return delay === undefined ? useTooltip() : useTooltip(() => delay);
  });
}
it('shows after the shared hover delay and hides immediately on exit', () => {
  const hint = mount();
  hint.enter();
  vi.advanceTimersByTime(449);
  expect(hint.open()).toBe(false);
  vi.advanceTimersByTime(1);
  expect(hint.open()).toBe(true);
  hint.hide();
  expect(hint.open()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels a short hover or pointer press before opening', () => {
  const hint = mount();
  hint.enter();
  vi.advanceTimersByTime(200);
  hint.hide();
  vi.advanceTimersByTime(1000);
  expect(hint.open()).toBe(false);
});
it('restarts a pending hover with one task and cancels it on disposal', () => {
  const hint = mount(100);
  hint.enter();
  vi.advanceTimersByTime(80);
  hint.enter();
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(99);
  expect(hint.open()).toBe(false);
  disposers.pop()!();
  vi.advanceTimersByTime(1000);
  expect(hint.open()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it.each([[-10, 0], [0, 0], [100_000, 10_000], [NaN, 450], [Infinity, 450]])(
  'bounds delay %s to %s ms', (requested, expected) => {
    const hint = mount(requested);
    hint.enter();
    if (expected > 0) {
      vi.advanceTimersByTime(expected - 1);
      expect(hint.open()).toBe(false);
      vi.advanceTimersByTime(1);
    } else vi.advanceTimersByTime(0);
    expect(hint.open()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  },
);
