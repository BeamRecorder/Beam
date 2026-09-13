import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickSnipAutoClose } from '~/api/types/quick-snip';
import QuickSnipCountdown from './QuickSnipCountdown.vue';

type AnimationCall = {
  element: Element;
  keyframes: Keyframe[] | PropertyIndexedKeyframes;
  options?: number | KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
};

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalAnimateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
const now = 1_000_000;

let reducedMotion: boolean;
let mediaListeners: Set<EventListenerOrEventListenerObject>;
let mediaQuery: MediaQueryList;
let animationCalls: AnimationCall[];

const makeCountdown = (overrides: Partial<QuickSnipAutoClose> = {}): QuickSnipAutoClose => ({
  durationMs: 5_000,
  deadlineMs: now + 5_000,
  remainingMs: 5_000,
  ...overrides,
});

const setReducedMotion = (matches: boolean) => {
  reducedMotion = matches;
  const event = new Event('change');
  for (const listener of mediaListeners) {
    if (typeof listener === 'function') listener(event);
    else listener.handleEvent(event);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  reducedMotion = false;
  mediaListeners = new Set();
  animationCalls = [];

  mediaQuery = {
    get matches() {
      return reducedMotion;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      mediaListeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      mediaListeners.delete(listener);
    }),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: vi.fn(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes,
      options?: number | KeyframeAnimationOptions,
    ) {
      const cancel = vi.fn();
      animationCalls.push({ element: this, keyframes, options, cancel });
      return { cancel } as unknown as Animation;
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalMatchMediaDescriptor) Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
  else Reflect.deleteProperty(window, 'matchMedia');
  if (originalAnimateDescriptor) Object.defineProperty(Element.prototype, 'animate', originalAnimateDescriptor);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});

describe('QuickSnipCountdown', () => {
  it('renders an aria-hidden progress bar and animates from the native deadline', () => {
    const wrapper = mount(QuickSnipCountdown, {
      props: {
        countdown: makeCountdown({ durationMs: 10_000, deadlineMs: now + 4_000, remainingMs: 1_000 }),
      },
    });

    const fill = wrapper.get<HTMLDivElement>('.countdown-fill');
    expect(wrapper.get('.close-countdown').attributes('aria-hidden')).toBe('true');
    expect(fill.find('.progress-bar-container').exists()).toBe(true);
    expect(fill.get('.progress-bar-fill').attributes('style')).toContain('width: 100%');
    expect(fill.element.style.transform).toBe('scaleX(0.4)');
    expect(animationCalls).toHaveLength(1);
    expect(animationCalls[0]!).toMatchObject({
      element: fill.element,
      keyframes: [{ transform: 'scaleX(0.4)' }, { transform: 'scaleX(0)' }],
      options: { duration: 4_000, easing: 'linear', fill: 'forwards' },
    });

    wrapper.unmount();
  });

  it('freezes on pause and a null deadline, then starts a fresh native deadline on resume', async () => {
    const wrapper = mount(QuickSnipCountdown, { props: { countdown: makeCountdown() } });
    const fill = wrapper.get<HTMLDivElement>('.countdown-fill');

    vi.setSystemTime(now + 2_000);
    await wrapper.setProps({ paused: true });
    expect(animationCalls[0]!.cancel).toHaveBeenCalledOnce();
    expect(fill.element.style.transform).toBe('scaleX(0.6)');
    expect(animationCalls).toHaveLength(1);

    await wrapper.setProps({
      countdown: makeCountdown({ deadlineMs: null, remainingMs: 3_000 }),
      paused: false,
    });
    expect(fill.element.style.transform).toBe('scaleX(0.6)');
    expect(animationCalls).toHaveLength(1);

    const resumedDeadline = Date.now() + 5_000;
    await wrapper.setProps({
      countdown: makeCountdown({ deadlineMs: resumedDeadline, remainingMs: 5_000 }),
      paused: false,
    });
    expect(fill.element.style.transform).toBe('scaleX(1)');
    expect(animationCalls).toHaveLength(2);
    expect(animationCalls[1]!.options).toMatchObject({ duration: 5_000, easing: 'linear', fill: 'forwards' });

    wrapper.unmount();
  });

  it('leaves a running animation alone when native snapshots repeat the same deadline', async () => {
    const countdown = makeCountdown();
    const wrapper = mount(QuickSnipCountdown, { props: { countdown } });

    vi.setSystemTime(now + 800);
    await wrapper.setProps({ countdown: { ...countdown, remainingMs: 4_200 } });

    expect(animationCalls).toHaveLength(1);
    expect(animationCalls[0]!.cancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('uses one-second steps for reduced motion and cleans up its timer and media listener', () => {
    setReducedMotion(true);
    const wrapper = mount(QuickSnipCountdown, {
      props: { countdown: makeCountdown({ deadlineMs: now + 2_500 }) },
    });
    const fill = wrapper.get<HTMLDivElement>('.countdown-fill');

    expect(animationCalls).toHaveLength(0);
    expect(fill.element.style.transform).toBe('scaleX(0.5)');
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1_000);
    expect(fill.element.style.transform).toBe('scaleX(0.3)');
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('cancels an active animation and removes the motion listener on unmount', () => {
    const wrapper = mount(QuickSnipCountdown, { props: { countdown: makeCountdown() } });

    wrapper.unmount();

    expect(animationCalls[0]!.cancel).toHaveBeenCalledOnce();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
