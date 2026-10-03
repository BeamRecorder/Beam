import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useHtmlThumbnailActivity } from '../useHtmlThumbnailActivity';
const scopes: ReturnType<typeof effectScope>[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});
function setup() {
  const playing = ref(false),
    time = ref(0),
    ready = ref(false),
    scope = effectScope();
  scopes.push(scope);
  const activity = scope.run(() => useHtmlThumbnailActivity(playing, time, ready))!;
  return { playing, time, ready, scope, ...activity };
}
describe('HTML thumbnail priority', () => {
  it('waits for registration and media readiness, reducing capture priority immediately on play', () => {
    const f = setup();
    expect(f.suspended.value).toBe(true);
    f.ready.value = true;
    expect(f.suspended.value).toBe(false);
    f.playing.value = true;
    expect(f.suspended.value).toBe(false);
    expect(f.interactive.value).toBe(true);
    f.time.value = 5;
    vi.advanceTimersByTime(1000);
    expect(f.suspended.value).toBe(false);
    expect(f.interactive.value).toBe(true);
    f.playing.value = false;
    vi.advanceTimersByTime(179);
    expect(f.suspended.value).toBe(false);
    expect(f.interactive.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.interactive.value).toBe(false);
  });
  it('keeps captures enabled during repeated reverse seeks and restores full priority after the gesture', () => {
    const f = setup();
    f.ready.value = true;
    f.time.value = 8;
    vi.advanceTimersByTime(150);
    f.time.value = 2;
    vi.advanceTimersByTime(179);
    expect(f.suspended.value).toBe(false);
    expect(f.interactive.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.interactive.value).toBe(false);
    f.ready.value = false;
    expect(f.suspended.value).toBe(true);
  });
  it('cancels seek settling on renewed playback and releases timers on disposal', () => {
    const f = setup();
    f.ready.value = true;
    f.time.value = 3;
    expect(vi.getTimerCount()).toBe(1);
    f.playing.value = true;
    expect(vi.getTimerCount()).toBe(0);
    f.playing.value = false;
    f.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
