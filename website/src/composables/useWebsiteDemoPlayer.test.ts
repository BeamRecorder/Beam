import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipComposition } from '~/media/shared';

type EventName = 'time' | 'frame' | 'state' | 'error';
type Listener = (value: unknown) => void;

const { engineInstances, FakeMediaPlaybackEngine } = vi.hoisted(() => {
  class FakeMediaPlaybackEngine {
    readonly listeners = new Map<EventName, Set<Listener>>();
    readonly loadComposition = vi.fn(async (_composition: ClipComposition): Promise<void> => undefined);
    readonly play = vi.fn(async (_time: number) => undefined);
    readonly pause = vi.fn();
    readonly seek = vi.fn(async (time: number, _mode: 'seek' | 'scrub') => {
      this.emit('time', time);
      return 'presented' as const;
    });
    readonly dispose = vi.fn(() => this.listeners.clear());
    readonly frameFor = vi.fn(() => null);

    constructor() {
      engineInstances.push(this);
    }

    on(event: EventName, listener: Listener) {
      const listeners = this.listeners.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return () => listeners.delete(listener);
    }

    emit(event: EventName, value: unknown) {
      for (const listener of this.listeners.get(event) ?? []) listener(value);
    }
  }

  const engineInstances: FakeMediaPlaybackEngine[] = [];
  return { engineInstances, FakeMediaPlaybackEngine };
});

vi.mock('~/media/playback', () => ({ MediaPlaybackEngine: FakeMediaPlaybackEngine }));

import { useWebsiteDemoPlayer } from './useWebsiteDemoPlayer';

const composition = (durationMs: number): ClipComposition =>
  ({
    assets: [],
    clips: [{ timelineStartMs: 0, timelineDurationMs: durationMs }],
  }) as unknown as ClipComposition;

const createHarness = () => {
  const scope = effectScope();
  const player = scope.run(() => useWebsiteDemoPlayer());
  if (!player) throw new Error('Expected the demo player composable to be created.');
  return { player, scope };
};

const getEngine = () => {
  const engine = engineInstances.at(-1);
  if (!engine) throw new Error('Expected the demo player engine to be created.');
  return engine;
};

afterEach(() => {
  engineInstances.length = 0;
  vi.clearAllMocks();
});

describe('useWebsiteDemoPlayer', () => {
  it('loads a composition, calculates duration, and preserves a clamped playhead', async () => {
    const { player, scope } = createHarness();

    await player.loadComposition(composition(4_000));
    const engine = getEngine();
    await player.seek(2.5);
    await player.loadComposition(composition(1_500));

    expect(engine.loadComposition).toHaveBeenCalledTimes(2);
    expect(player.duration.value).toBe(1.5);
    expect(player.currentTime.value).toBe(1.5);
    expect(engine.seek).toHaveBeenLastCalledWith(1.5, 'seek');
    expect(player.playbackError.value).toBeNull();
    expect(player.frameVersion.value).toBe(2);

    scope.stop();
  });

  it('reflects time, frame, state, and error events', async () => {
    const { player, scope } = createHarness();
    await player.loadComposition(composition(3_000));
    const engine = getEngine();

    const error = { kind: 'decode-failure', sourceId: 'demo', message: 'decode failed' } as const;
    engine.emit('time', 1.25);
    engine.emit('frame', { clipId: 'demo-clip' });
    engine.emit('state', 'playing');
    engine.emit('error', error);

    expect(player.currentTime.value).toBe(1.25);
    expect(player.frameVersion.value).toBe(2);
    expect(player.playbackState.value).toBe('playing');
    expect(player.isPlaying.value).toBe(true);
    expect(player.playbackError.value).toEqual(error);

    scope.stop();
  });

  it('clamps finite seeks and rejects invalid times before touching the engine', async () => {
    const { player, scope } = createHarness();
    await player.loadComposition(composition(2_000));
    const engine = getEngine();

    await expect(player.seek(Number.NaN)).rejects.toThrow('finite');
    await expect(player.seek(Number.POSITIVE_INFINITY)).rejects.toThrow('finite');
    expect(engine.seek).not.toHaveBeenCalled();

    await player.seek(-2, 'scrub');
    await player.seek(99);

    expect(engine.seek).toHaveBeenNthCalledWith(1, 0, 'scrub');
    expect(engine.seek).toHaveBeenNthCalledWith(2, 2, 'seek');
    expect(player.currentTime.value).toBe(2);

    scope.stop();
  });

  it('delegates play and pause intents to the playback engine', async () => {
    const { player, scope } = createHarness();
    await player.loadComposition(composition(2_000));
    const engine = getEngine();
    engine.emit('time', 0.75);

    await player.setPlaying(true);
    await player.setPlaying(false);

    expect(engine.play).toHaveBeenCalledWith(0.75);
    expect(engine.pause).toHaveBeenCalledOnce();

    scope.stop();
  });

  it('waits for an in-flight load before honoring play intent', async () => {
    const { player, scope } = createHarness();
    let finishLoad: () => void = () => {};
    const loading = new Promise<void>((resolve) => {
      finishLoad = resolve;
    });

    const initialLoad = player.loadComposition(composition(2_000));
    const engine = getEngine();
    engine.loadComposition.mockImplementationOnce(async () => loading);
    const reloading = player.loadComposition(composition(2_000));
    const playing = player.setPlaying(true);

    expect(engine.play).not.toHaveBeenCalled();
    finishLoad();
    await Promise.all([initialLoad, reloading, playing]);
    expect(engine.play).toHaveBeenCalledWith(0);

    scope.stop();
  });

  it('resumes playback after reloading an edited composition', async () => {
    const { player, scope } = createHarness();
    await player.loadComposition(composition(3_000));
    const engine = getEngine();
    await player.setPlaying(true);
    engine.emit('time', 1.25);

    await player.loadComposition(composition(2_000));

    expect(engine.seek).toHaveBeenLastCalledWith(1.25, 'seek');
    expect(engine.play).toHaveBeenLastCalledWith(1.25);
    expect(engine.play).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('disposes the engine with its Vue scope and rejects later commands', async () => {
    const { player, scope } = createHarness();
    await player.loadComposition(composition(1_000));
    const engine = getEngine();

    scope.stop();

    expect(engine.dispose).toHaveBeenCalledOnce();
    await expect(player.seek(0)).rejects.toThrow('disposed');
    await expect(player.setPlaying(true)).rejects.toThrow('disposed');
  });
});
