import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateStartupPortrait } from './startup-portrait';
import { createBeamyMotion } from '../Beamy/beamy-motion';
import type { StartupPortrait } from './startup-types';

let frames: Map<number, FrameRequestCallback>;
let nextId: number;
let hidden: boolean;
let reduced: boolean;
let change: (event: MediaQueryListEvent) => void;
let removeMotion: ReturnType<typeof vi.fn>;
let element: HTMLElement;
const portraits: StartupPortrait[] = [];
const tick = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(time));
};
const setup = () => {
  const portrait = animateStartupPortrait(element);
  portraits.push(portrait);
  return portrait;
};
const path = () => element.querySelector('.startup-cloud')!.getAttribute('d');
beforeEach(() => {
  element = document.createElement('div');
  element.innerHTML =
    '<svg><path class="startup-cloud"/><path class="startup-eyes"/><path class="startup-eyes"/></svg>';
  frames = new Map();
  nextId = 0;
  hidden = false;
  reduced = false;
  removeMotion = vi.fn();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: (_: string, callback: typeof change) => {
      change = callback;
    },
    removeEventListener: removeMotion,
  }));
});
afterEach(() => {
  portraits.splice(0).forEach((portrait) => portrait.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lightweight startup portrait', () => {
  it('uses the real shape engine, updates at most 30 fps, and caps stalled frames', () => {
    setup();
    const cloud = createBeamyMotion('idle')(0).frame;
    expect(path()).toBe(cloud.bodyPath);
    expect(element.querySelector('.startup-eyes')?.getAttribute('transform')).toBe(cloud.eyes[0]!.matrix);
    expect(frames.size).toBe(1);
    tick(0);
    tick(25000);
    expect(path()).toBe(cloud.bodyPath);
    for (let time = 25040; time <= 25280; time += 40) tick(time);
    const displayed = path();
    expect(displayed).not.toBe(cloud.bodyPath);
    tick(25290);
    expect(path()).toBe(displayed);
    expect(frames.size).toBe(1);
  });
  it('morphs its exact displayed frame gently into the resting cloud before stopping', () => {
    const portrait = setup();
    for (let time = 0; time <= 700; time += 50) tick(time);
    const displayed = path();
    portrait.settle();
    expect(path()).toBe(displayed);
    for (let time = 750; time <= 1100; time += 50) tick(time);
    expect(frames.size).toBe(1);
    expect(path()).not.toBe(displayed);
    for (let time = 1150; time <= 1450; time += 50) tick(time);
    expect(path()).toBe(createBeamyMotion('idle')(0).frame.bodyPath);
    expect(frames.size).toBe(0);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
  });
  it('pauses while hidden and resumes without advancing through the hidden interval', () => {
    setup();
    tick(0);
    tick(100);
    const displayed = path();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    tick(100000);
    expect(path()).toBe(displayed);
    expect(frames.size).toBe(1);
  });
  it('keeps reduced motion still and responds to preference changes', () => {
    reduced = true;
    setup();
    expect(frames.size).toBe(0);
    change({ matches: false } as MediaQueryListEvent);
    expect(frames.size).toBe(1);
    change({ matches: true } as MediaQueryListEvent);
    expect(frames.size).toBe(0);
    expect(path()).toBe(createBeamyMotion('idle')(0).frame.bodyPath);
  });
  it('tolerates a shell without artwork and disposes listeners and frames only once', () => {
    element.innerHTML = '';
    const removeVisibility = vi.spyOn(document, 'removeEventListener');
    const portrait = setup();
    expect(frames.size).toBe(0);
    portrait.settle();
    portrait.dispose();
    portrait.dispose();
    expect(removeMotion).toHaveBeenCalledOnce();
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
