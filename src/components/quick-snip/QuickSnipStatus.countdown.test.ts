import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, type PropType } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickSnipAutoClose, QuickSnipSnapshot } from '~/api/types/quick-snip';

const capture = vi.hoisted(() => {
  let statusListener: ((status: unknown) => void) | undefined;

  return {
    getQuickSnipState: vi.fn(),
    getQuickSnipRenderTask: vi.fn(),
    onQuickSnipStatus: vi.fn((listener: (status: unknown) => void) => {
      statusListener = listener;
      return vi.fn(() => {
        if (statusListener === listener) statusListener = undefined;
      });
    }),
    emitQuickSnipStatus: (status: unknown) => statusListener?.(status),
    resetStatusListener: () => {
      statusListener = undefined;
    },
    onQuickSnipStatusBlur: vi.fn(),
    onQuickSnipRenderTask: vi.fn(),
    setQuickSnipStatusInteractive: vi.fn(),
    notifyQuickSnipStatusReady: vi.fn(),
  };
});

vi.mock('~/api/capture', () => ({ capture }));
vi.mock('./quick-snip-export', () => ({ renderQuickSnip: vi.fn() }));
vi.mock('../video-editor/screenshot/screenshot-render', () => ({ encodeScreenshot: vi.fn() }));

import QuickSnipStatus from './QuickSnipStatus.vue';

const CountdownProbe = defineComponent({
  name: 'QuickSnipCountdown',
  props: {
    countdown: { type: Object as PropType<QuickSnipAutoClose>, required: true },
    paused: { type: Boolean, default: false },
  },
  template: '<div class="countdown-probe" :data-paused="paused" />',
});

const autoClose: QuickSnipAutoClose = {
  durationMs: 5_000,
  deadlineMs: Date.now() + 5_000,
  remainingMs: 5_000,
};

const makeSnapshot = (
  state: 'completed' | 'processing' = 'completed',
  countdown: QuickSnipAutoClose | null = null,
): QuickSnipSnapshot => ({
  state,
  job: null,
  progress: state === 'completed' ? 1 : 0.5,
  result: state === 'completed' ? { path: '/tmp/quick-snip.mp4', projectId: null } : null,
  error: null,
  autoClose: countdown,
});

let wrappers: Array<ReturnType<typeof mount>>;

const mountStatus = () => {
  const wrapper = mount(QuickSnipStatus, {
    global: { stubs: { QuickSnipCountdown: CountdownProbe } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  wrappers = [];
  capture.resetStatusListener();
  capture.getQuickSnipState.mockResolvedValue(makeSnapshot('completed'));
  capture.getQuickSnipRenderTask.mockResolvedValue(null);
  capture.onQuickSnipStatusBlur.mockReturnValue(vi.fn());
  capture.onQuickSnipRenderTask.mockReturnValue(vi.fn());
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  vi.useRealTimers();
  capture.resetStatusListener();
});

describe('QuickSnipStatus auto-close countdown', () => {
  it('waits for the native auto-close snapshot and renders the bar below the detail', async () => {
    const wrapper = mountStatus();
    await flushPromises();

    expect(wrapper.find('.countdown-probe').exists()).toBe(false);
    expect(capture.notifyQuickSnipStatusReady).toHaveBeenCalledOnce();

    capture.emitQuickSnipStatus(makeSnapshot('completed', autoClose));
    await flushPromises();

    const countdown = wrapper.get('.countdown-probe');
    const statusCopy = wrapper.get('.status-copy').element;
    const detail = wrapper.get('.status-copy > span').element;
    expect(countdown.element.parentElement).toBe(statusCopy);
    expect([...statusCopy.children].indexOf(countdown.element)).toBeGreaterThan(
      [...statusCopy.children].indexOf(detail),
    );
    expect(countdown.attributes('data-paused')).toBe('false');
  });

  it.each([
    ['completed without a native deadline', makeSnapshot('completed')],
    ['not completed even when a timer is present', makeSnapshot('processing', autoClose)],
  ])('hides the countdown when the snapshot is %s', async (_description, snapshot) => {
    capture.getQuickSnipState.mockResolvedValue(snapshot);
    const wrapper = mountStatus();
    await flushPromises();

    expect(wrapper.find('.countdown-probe').exists()).toBe(false);
  });

  it('pauses immediately on hover and resumes after the 300 ms leave grace period', async () => {
    capture.getQuickSnipState.mockResolvedValue(makeSnapshot('completed', autoClose));
    const wrapper = mountStatus();
    await flushPromises();
    const countdown = wrapper.get('.countdown-probe');
    const surface = wrapper.get('.snip-surface');

    vi.useFakeTimers();
    await surface.trigger('mouseenter');
    expect(countdown.attributes('data-paused')).toBe('true');
    expect(capture.setQuickSnipStatusInteractive).toHaveBeenNthCalledWith(1, true);

    await surface.trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(299);
    expect(countdown.attributes('data-paused')).toBe('true');

    await vi.advanceTimersByTimeAsync(1);
    expect(countdown.attributes('data-paused')).toBe('false');
    expect(capture.setQuickSnipStatusInteractive).toHaveBeenNthCalledWith(2, false);
  });
});
