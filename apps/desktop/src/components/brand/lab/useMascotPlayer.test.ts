import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreset } from './mascot-storage';
import { useMascotPlayer } from './useMascotPlayer';
import { createMascotEngine, DEFAULT_LOOK } from './mascot-catalog';

describe('mascot playback lifecycle', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;
  let motion: ((event: MediaQueryListEvent) => void) | undefined;
  let reduced: boolean;
  let hidden: boolean;
  const wrappers: ReturnType<typeof mount>[] = [];
  beforeEach(() => {
    callbacks = new Map();
    nextId = 0;
    reduced = false;
    hidden = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    vi.stubGlobal('matchMedia', () => ({
      matches: reduced,
      addEventListener: (_: string, callback: typeof motion) => {
        motion = callback;
      },
      removeEventListener: vi.fn(),
    }));
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  });
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const setup = () => {
    const preset = defaultPreset();
    const look = ref(preset.look);
    const steps = ref(preset.timeline);
    let player!: ReturnType<typeof useMascotPlayer>;
    wrappers.push(
      mount(
        defineComponent({
          setup() {
            player = useMascotPlayer(look, steps);
            return () => null;
          },
        }),
      ),
    );
    return { player, look, steps };
  };
  const tick = (ms: number) => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => callback(ms));
  };
  it('animates with one owned frame loop and freezes on pause', async () => {
    const { player } = setup();
    expect(callbacks.size).toBe(1);
    tick(0);
    tick(64);
    const frame = player.frame.value;
    player.playing.value = false;
    await nextTick();
    expect(callbacks.size).toBe(0);
    tick(128);
    expect(player.frame.value).toEqual(frame);
  });
  it('resumes without advancing through the paused interval', async () => {
    const { player } = setup();
    tick(0);
    tick(64);
    player.playing.value = false;
    await nextTick();
    const paused = player.frame.value;
    player.playing.value = true;
    await nextTick();
    tick(9999);
    expect(player.frame.value).toEqual(paused);
  });
  it('stops when hidden and releases all frames on unmount', async () => {
    setup();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(1);
    wrappers[0]!.unmount();
    expect(callbacks.size).toBe(0);
  });
  it('respects reduced motion at startup and when the preference changes', async () => {
    reduced = true;
    const { player } = setup();
    expect(player.playing.value).toBe(false);
    expect(callbacks.size).toBe(0);
    player.playing.value = true;
    await nextTick();
    motion!({ matches: true } as MediaQueryListEvent);
    await nextTick();
    expect(callbacks.size).toBe(0);
    motion!({ matches: false } as MediaQueryListEvent);
    expect(player.reducedMotion.value).toBe(false);
    expect(player.playing.value).toBe(false);
  });
  it('changes state while playing and while paused', async () => {
    const { player } = setup();
    player.choose('orbit');
    tick(0);
    tick(64);
    expect(player.state.value).toBe('orbit');
    player.playing.value = false;
    await nextTick();
    player.choose('thinking');
    expect(player.frame.value.dots.length).toBeGreaterThan(0);
    expect(player.sequencing.value).toBe(false);
  });
  it('seeks deterministic frames in either direction and clamps to the timeline', () => {
    const { player } = setup();
    player.seek(4.8);
    const expected = player.frame.value;
    player.seek(0);
    player.seek(4.8);
    expect(player.frame.value).toEqual(expected);
    expect(player.state.value).toBe('orbit');
    player.seek(-1);
    expect(player.elapsed.value).toBe(0);
    player.seek(100);
    expect(player.elapsed.value).toBe(player.duration.value);
  });
  it('advances through boundaries and loops the timeline', () => {
    const { player } = setup();
    player.seek(1.98);
    tick(0);
    tick(64);
    expect(player.state.value).toBe('thinking');
    expect(player.activeStep.value).toBe(1);
    player.seek(8.98);
    tick(128);
    expect(player.state.value).toBe('idle');
    expect(player.elapsed.value).toBe(0);
  });
  it('changes speed and bounds deltas after a long frame stall', () => {
    const { player } = setup();
    player.seek(0);
    player.speed.value = 2;
    tick(0);
    tick(10000);
    expect(player.elapsed.value).toBeCloseTo(0.128);
  });
  it('morphs through the loop seam instead of snapping to the first silhouette', async () => {
    const { player, steps } = setup();
    steps.value = [
      { state: 'idle', duration: 1 },
      { state: 'comet', duration: 2 },
    ];
    await nextTick();
    player.seek(2.99);
    const reference = createMascotEngine(DEFAULT_LOOK);
    reference.setState('comet', 1);
    tick(0);
    tick(64);
    expect(player.state.value).toBe('idle');
    expect(player.frame.value.bodyPath).not.toBe(createMascotEngine(DEFAULT_LOOK).sample(0).bodyPath);
    expect(player.frame.value.bodyPath).toBe(reference.sample(3.054).bodyPath);
  });
  it('updates the look both during animation and while frozen', async () => {
    const { player, look } = setup();
    look.value.shape = 'nuage';
    await nextTick();
    tick(0);
    tick(64);
    player.playing.value = false;
    await nextTick();
    const before = player.frame.value;
    look.value.shape = 'squircle';
    look.value.eyes = 'star';
    look.value.expression = 'heureux';
    await nextTick();
    expect(player.frame.value).not.toEqual(before);
    expect(callbacks.size).toBe(0);
  });
  it('reconciles duration edits only when the sequence is active', async () => {
    const { player, steps } = setup();
    steps.value[0]!.duration = 1;
    await nextTick();
    expect(player.sequencing.value).toBe(false);
    player.seek(4);
    steps.value = [{ state: 'idle', duration: 1 }];
    await nextTick();
    expect(player.elapsed.value).toBe(1);
    expect(player.activeStep.value).toBe(0);
  });
  it('applies eye edits immediately while paused and preserves them through state changes and seeks', async () => {
    const { player, look } = setup();
    player.playing.value = false;
    await nextTick();
    const before = player.frame.value;
    look.value.eyeGeometry.size = 1.5;
    look.value.eyeGeometry.spacing = 1.3;
    await nextTick();
    expect(player.frame.value.eyes[0]!.d).not.toBe(before.eyes[0]!.d);
    expect(player.frame.value.eyes[0]!.matrix).not.toBe(before.eyes[0]!.matrix);
    expect(callbacks.size).toBe(0);
    player.choose('wide');
    expect(player.frame.value).toEqual(createMascotEngine(look.value, 'wide').sample(0));
    player.seek(0.8);
    expect(player.frame.value).toEqual(createMascotEngine(look.value).sample(0.8));
    player.seek(4.8);
    player.seek(0.8);
    expect(player.frame.value).toEqual(createMascotEngine(look.value).sample(0.8));
  });
  it('follows mouse gaze, releases it, and ignores touch or boxes without area', async () => {
    const { player } = setup();
    tick(0);
    tick(64);
    const rect = { x: 0, y: 0, width: 400, height: 400 } as DOMRect;
    const pointer = {
      clientX: 400,
      clientY: 0,
      pointerType: 'mouse',
    } as PointerEvent;
    const initial = player.frame.value;
    player.aim(pointer, rect);
    tick(64);
    expect(player.frame.value).toEqual(initial);
    player.follow.value = true;
    await nextTick();
    player.aim(pointer, rect);
    tick(128);
    expect(player.frame.value).not.toEqual(initial);
    player.aim({ ...pointer, pointerType: 'touch' } as PointerEvent, rect);
    player.aim(pointer, { ...rect, width: 0 } as DOMRect);
    player.aim(pointer, { ...rect, height: 0 } as DOMRect);
    player.release();
    tick(192);
    expect(player.frame.value.bodyPath).not.toContain('NaN');
    player.playing.value = false;
    await nextTick();
    player.aim(pointer, rect);
    expect(callbacks.size).toBe(0);
  });
});
