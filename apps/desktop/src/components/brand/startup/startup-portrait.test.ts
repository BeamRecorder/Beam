import { readFileSync } from 'node:fs';
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
const path = () => element.querySelector('.startup-body')!.getAttribute('d');
beforeEach(() => {
  element = document.createElement('div');
  element.innerHTML =
    '<svg><path class="startup-body"/><path class="startup-eyes"/><path class="startup-eyes"/><g class="startup-dots"><circle/><circle/></g></svg>';
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
  it('shows the same three loading dots in static HTML and the first animated frame', () => {
    const html = readFileSync('apps/desktop/html/index.html', 'utf8');
    const document = new DOMParser().parseFromString(html, 'text/html');
    const initialEyes = [...document.querySelectorAll('.startup-eyes')];
    const loading = createBeamyMotion('loading')(0).frame;
    expect(initialEyes.every((eye) => eye.getAttribute('opacity') === '0')).toBe(true);
    expect(document.querySelector('.startup-body')?.getAttribute('d')).toBe(loading.bodyPath);
    const initialDots = [...document.querySelectorAll('.startup-dots circle')];
    expect(initialDots).toHaveLength(2);
    initialDots.forEach((dot, index) => {
      expect(Number(dot.getAttribute('r'))).toBe(loading.dots[index]!.r);
      expect(Number(dot.getAttribute('cx'))).toBe(loading.dots[index]!.x);
      expect(Number(dot.getAttribute('opacity'))).toBe(loading.dots[index]!.opacity);
    });
    setup();
    expect(path()).toBe(loading.bodyPath);
  });
  it('uses the real shape engine, updates at most 30 fps, and caps stalled frames', () => {
    setup();
    const loading = createBeamyMotion('loading')(0).frame;
    expect(path()).toBe(loading.bodyPath);
    expect(element.querySelector('.startup-eyes')?.getAttribute('opacity')).toBe('0');
    expect(frames.size).toBe(1);
    tick(0);
    tick(25000);
    expect(path()).toBe(createBeamyMotion('loading')(0.1).frame.bodyPath);
    for (let time = 25040; time <= 25280; time += 40) tick(time);
    const displayed = path();
    expect(displayed).not.toBe(loading.bodyPath);
    tick(25290);
    expect(path()).toBe(displayed);
    expect(frames.size).toBe(1);
  });
  it('renders loading dots, hides the eyes and then restores the normal face', () => {
    setup();
    for (let time = 0; time <= 2000; time += 50) tick(time);
    const dots = [...element.querySelectorAll('.startup-dots circle')];
    expect(dots.every((dot) => Number(dot.getAttribute('opacity')) > 0)).toBe(true);
    expect(dots.every((dot) => Number(dot.getAttribute('r')) > 0)).toBe(true);
    expect([...element.querySelectorAll('.startup-eyes')].every((eye) => eye.getAttribute('opacity') === '0')).toBe(
      true,
    );
    for (let time = 2050; time <= 3700; time += 50) tick(time);
    expect(dots.every((dot) => dot.getAttribute('opacity') === '0')).toBe(true);
    expect([...element.querySelectorAll('.startup-eyes')].every((eye) => eye.getAttribute('opacity') === '1')).toBe(
      true,
    );
    expect(path()).not.toMatch(/NaN|Infinity/);
    for (let time = 3750; time <= 5000; time += 50) tick(time);
    expect(dots.every((dot) => Number(dot.getAttribute('opacity')) > 0)).toBe(true);
    expect([...element.querySelectorAll('.startup-eyes')].every((eye) => eye.getAttribute('opacity') === '0')).toBe(
      true,
    );
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
    expect(path()).toBe(createBeamyMotion('loading')(0).frame.bodyPath);
  });
  it('tolerates a shell without artwork and disposes listeners and frames only once', () => {
    element.innerHTML = '';
    const removeVisibility = vi.spyOn(document, 'removeEventListener');
    const portrait = setup();
    expect(frames.size).toBe(0);
    portrait.dispose();
    portrait.dispose();
    expect(removeMotion).toHaveBeenCalledOnce();
    expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
