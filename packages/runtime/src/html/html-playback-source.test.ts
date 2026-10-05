import { describe, expect, it, vi } from 'vitest';
import { bindHtmlPlaybackSource, createHtmlPlaybackClock } from './html-playback-source';
import { htmlSceneFixture } from '../../../engine/src/html/tests/html-scene-fixture';
import type { HtmlClockEngine } from './html-playback-types';
import type { PlaybackEventMap } from '../playback/playback-types';

function setup() {
  const listeners = new Map<keyof PlaybackEventMap, Set<(value: never) => void>>();
  const time = { value: 1 };
  const engine = {
    get currentTime() {
      return time.value;
    },
    on(event, listener) {
      let entries = listeners.get(event);
      if (!entries) listeners.set(event, (entries = new Set()));
      entries.add(listener as (value: never) => void);
      return () => {
        entries.delete(listener as (value: never) => void);
      };
    },
  } satisfies HtmlClockEngine;
  const clock = createHtmlPlaybackClock(() => engine);
  const emit = <K extends keyof PlaybackEventMap>(event: K, value: PlaybackEventMap[K]) => {
    for (const listener of listeners.get(event) ?? []) listener(value as never);
  };
  return { engine, time, clock, emit, listeners };
}
describe('HTML playback driven by the runtime', () => {
  it('forwards engine time immediately, independently of Vue or a second animation clock', () => {
    const f = setup(),
      listener = vi.fn();
    expect(f.clock.currentTime()).toBe(1);
    const stop = f.clock.subscribe(listener);
    f.emit('time', 2.5);
    expect(listener).toHaveBeenCalledExactlyOnceWith(2.5);
    stop();
    f.emit('time', 4);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('presents the exact runtime position when pause or loading changes state', () => {
    const f = setup(),
      listener = vi.fn();
    const stop = f.clock.subscribe(listener);
    f.time.value = 4.25;
    f.emit('state', 'paused');
    expect(listener).toHaveBeenLastCalledWith(4.25);
    stop();
    f.emit('state', 'playing');
    expect(listener).toHaveBeenCalledTimes(1);
    expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
  it('keeps multiple surfaces independent and releases every subscription', () => {
    const f = setup(),
      first = vi.fn(),
      second = vi.fn();
    const stopFirst = f.clock.subscribe(first),
      stopSecond = f.clock.subscribe(second);
    stopFirst();
    f.emit('time', 3);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(3);
    stopSecond();
    stopSecond();
    f.emit('time', 5);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('maps trim, rate and reverse seeks into source time without fetching pixel frames', () => {
    const f = setup(),
      source = htmlSceneFixture(),
      send = vi.fn();
    source.clip.sourceInMs = 200;
    source.clip.playbackRate = 2;
    const binding = bindHtmlPlaybackSource(source, f.clock, send);
    binding.sync();
    expect(send).toHaveBeenLastCalledWith(200);
    f.emit('time', 1.5);
    expect(send).toHaveBeenLastCalledWith(1200);
    f.emit('time', 1.2);
    expect(send.mock.calls.at(-1)?.[0]).toBeCloseTo(600);
    binding.dispose();
    f.emit('time', 2);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('clamps short source duration, but ignores times outside the clip interval', () => {
    const f = setup(),
      source = htmlSceneFixture(),
      send = vi.fn();
    source.html.durationMs = 500;
    const binding = bindHtmlPlaybackSource(source, f.clock, send);
    f.emit('time', 0);
    expect(send).not.toHaveBeenCalled();
    f.emit('time', 3);
    expect(send).toHaveBeenLastCalledWith(500);
    f.emit('time', 16);
    expect(send).toHaveBeenCalledTimes(1);
    binding.dispose();
  });
  it('uses held source frames and handles static source descriptors', () => {
    const f = setup(),
      source = htmlSceneFixture(),
      send = vi.fn();
    source.clip.freezeFrameSourceMs = 2500;
    const binding = bindHtmlPlaybackSource(source, f.clock, send);
    f.emit('time', 4);
    expect(send).toHaveBeenLastCalledWith(2500);
    source.html.durationMs = 0;
    f.emit('time', 5);
    expect(send).toHaveBeenLastCalledWith(0);
    binding.dispose();
  });
});
