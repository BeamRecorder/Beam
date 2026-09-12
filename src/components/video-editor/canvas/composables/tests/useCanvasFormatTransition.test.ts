import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { OutputCanvasSettings } from '../../output-canvas';
import { DEFAULT_OUTPUT_CANVAS } from '../../output-canvas';
import { useCanvasFormatTransition } from '../useCanvasFormatTransition';

const scopes: EffectScope[] = [];

const makeTransition = () => {
  const output = ref<OutputCanvasSettings>({
    ...DEFAULT_OUTPUT_CANVAS,
  });
  const render = vi.fn();
  const scope = effectScope();
  scopes.push(scope);
  const transitioning = scope.run(() => useCanvasFormatTransition(() => output.value, render))!;
  return { scope, output, render, transitioning };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.useRealTimers();
});

describe('useCanvasFormatTransition', () => {
  it.each([
    ['width', { width: 1_280 }],
    ['height', { height: 720 }],
    ['background visibility', { showBackground: true }],
  ] as const)('starts a transition when the %s changes', async (_label, patch) => {
    const state = makeTransition();
    expect(state.transitioning.value).toBe(false);
    expect(state.render).not.toHaveBeenCalled();

    state.output.value = { ...state.output.value, ...patch };
    await nextTick();

    expect(state.transitioning.value).toBe(true);
    expect(state.render).toHaveBeenCalledOnce();
  });

  it('keeps the transition active for 259ms and ends it at 260ms', async () => {
    const state = makeTransition();
    state.output.value = { ...state.output.value, width: 1_280 };
    await nextTick();

    await vi.advanceTimersByTimeAsync(259);
    expect(state.transitioning.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.transitioning.value).toBe(false);
  });

  it('restarts the 260ms timer on each successive canvas change', async () => {
    const state = makeTransition();
    state.output.value = { ...state.output.value, width: 1_280 };
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);

    state.output.value = { ...state.output.value, height: 720 };
    await nextTick();
    expect(state.render).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(259);
    expect(state.transitioning.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.transitioning.value).toBe(false);
  });

  it('ignores canvas preset changes when dimensions and background visibility stay the same', async () => {
    const state = makeTransition();
    state.output.value = { ...state.output.value, preset: 'custom' };
    await nextTick();

    expect(state.transitioning.value).toBe(false);
    expect(state.render).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the pending timer when its effect scope is disposed', async () => {
    const state = makeTransition();
    state.output.value = { ...state.output.value, width: 1_280 };
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);

    state.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(260);

    expect(state.transitioning.value).toBe(true);
    expect(state.render).toHaveBeenCalledOnce();
  });

  it('disposes cleanly when there is no pending timer', () => {
    const state = makeTransition();

    state.scope.stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(state.transitioning.value).toBe(false);
  });
});
