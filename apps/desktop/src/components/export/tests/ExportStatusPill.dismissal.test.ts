import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ExportStatusPill from '../ExportStatusPill.vue';

const api = { openFile: vi.fn(), showItemInFolder: vi.fn() };
let wrapper: ReturnType<typeof mount>;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const setup = (props: Partial<InstanceType<typeof ExportStatusPill>['$props']> = {}) => {
  wrapper = mount(ExportStatusPill, {
    props: { state: 'completed', name: 'Finished export', format: 'mp4', filePath: '/exports/result.mp4', ...props },
    attachTo: document.body,
    global: { stubs: { Beamy: true } },
  });
  return wrapper;
};
const surface = () => document.body.querySelector<HTMLElement>('.snip-surface')!;
const hover = async (value: boolean) => {
  surface().dispatchEvent(new MouseEvent(value ? 'mouseenter' : 'mouseleave'));
  await nextTick();
};
const focus = async (value: boolean, relatedTarget: EventTarget | null = null) => {
  surface().dispatchEvent(new FocusEvent(value ? 'focusin' : 'focusout', { bubbles: true, relatedTarget }));
  await nextTick();
};
const watchVideo = async () => {
  document.body.querySelector<HTMLButtonElement>('[aria-label="Watch"]')!.click();
  await nextTick();
};
const paint = async () => {
  await nextTick();
  for (let frame = 0; frame < 2; frame += 1) {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(performance.now()));
    await nextTick();
  }
};
const advance = async (milliseconds: number) => {
  await paint();
  await vi.advanceTimersByTimeAsync(milliseconds);
};
const expectOpen = () => expect(wrapper.emitted('dismiss')).toBeUndefined();
const expectClosed = () => expect(wrapper.emitted('dismiss')).toEqual([[]]);

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  Object.defineProperty(window, 'capture', { configurable: true, value: api });
  api.openFile.mockReset().mockResolvedValue(undefined);
  api.showItemInFolder.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('finished export auto-dismissal', () => {
  it.each(['video', 'image'] as const)('closes a finished %s exactly once after five seconds', async (kind) => {
    setup({ kind });
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
    await advance(10_000);
    expectClosed();
  });

  it.each(['working', 'failed'] as const)('never automatically dismisses a %s export', async (state) => {
    setup({ state, progress: 1 });
    await advance(60_000);
    expectOpen();
  });

  it('starts the five seconds after the actual completion frame is painted', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    setup({ state: 'working' });
    await advance(10_000);
    await wrapper.setProps({ state: 'completed' });
    await vi.advanceTimersByTimeAsync(4_100);
    expectOpen();
    expect(document.body.querySelector('.completion-aura')).not.toBeNull();
    expect(document.body.querySelector('.mascot-melt')).toBeNull();
    expect(document.body.querySelector('[aria-label="Watch"]')).not.toBeNull();
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('preserves remaining time during hover and its 300 ms exit bridge', async () => {
    setup();
    await advance(2_000);
    await hover(true);
    await advance(20_000);
    expectOpen();
    await hover(false);
    await advance(299);
    expectOpen();
    await advance(1);
    await advance(2_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('waits for interaction to end if the export completes under the pointer', async () => {
    setup({ state: 'working' });
    await hover(true);
    await wrapper.setProps({ state: 'completed' });
    await advance(10_000);
    expectOpen();
    await hover(false);
    await advance(300);
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('keeps the timer paused when the pointer reenters during the exit bridge', async () => {
    setup();
    await hover(true);
    await hover(false);
    await advance(200);
    await hover(true);
    await advance(10_000);
    expectOpen();
    await hover(false);
    await advance(300);
    await advance(5_000);
    expectClosed();
  });

  it('pauses for keyboard focus and for focus moving between pill actions', async () => {
    setup();
    await advance(1_000);
    await focus(true);
    await advance(10_000);
    await focus(false, document.body.querySelector('[aria-label="Watch"]'));
    await advance(10_000);
    expectOpen();
    await focus(false, document.body);
    await advance(3_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('pauses while opening a file and resumes the unused time when it succeeds', async () => {
    let resolve!: () => void;
    api.openFile.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
    setup();
    await advance(1_500);
    await watchVideo();
    await advance(10_000);
    expectOpen();
    resolve();
    await flushPromises();
    await advance(3_499);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('keeps file-action errors visible until a retry succeeds', async () => {
    api.openFile.mockRejectedValueOnce(new Error('Player unavailable'));
    setup();
    await advance(1_000);
    await watchVideo();
    await flushPromises();
    await advance(20_000);
    expectOpen();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Player unavailable');
    await watchVideo();
    await flushPromises();
    await advance(3_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('keeps supplied errors visible and resumes when they are cleared', async () => {
    setup({ error: 'Unable to open file' });
    await advance(20_000);
    expectOpen();
    await wrapper.setProps({ error: null });
    await advance(5_000);
    expectClosed();
  });

  it('does not reset the countdown for progress or stage updates after completion', async () => {
    setup();
    await advance(4_000);
    await wrapper.setProps({ progress: 1, stageLabel: 'Done', preview: 'data:image/png;base64,AAAA' });
    await advance(1_000);
    expectClosed();
  });

  it('cancels an old deadline and gives a replacement export its own five seconds', async () => {
    setup();
    await advance(4_000);
    await wrapper.setProps({ state: 'working', name: 'Next export', filePath: null });
    await advance(10_000);
    expectOpen();
    await wrapper.setProps({ state: 'completed', filePath: '/exports/next.mp4' });
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('resets a completed replacement even when its display name is unchanged', async () => {
    setup();
    await advance(4_000);
    await wrapper.setProps({ filePath: '/exports/replacement.mp4' });
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('cancels the countdown after manual dismissal', async () => {
    setup();
    document.body.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click();
    await advance(20_000);
    expectClosed();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes the countdown without emitting when the editor is closed', async () => {
    setup();
    await advance(2_000);
    wrapper.unmount();
    await advance(10_000);
    expectOpen();
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('cancels presentation frames if the editor closes before its first completion paint', async () => {
    setup();
    expect(frames.size).toBe(1);
    wrapper.unmount();
    await advance(10_000);
    expectOpen();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not consume completion time in a hidden editor', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    setup();
    await advance(60_000);
    expectOpen();
    expect(frames.size).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });

  it('waits until the dialog morph finishes before counting visible completion time', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
    let finish!: () => void;
    const animation = {
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      cancel: vi.fn(),
    };
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: () => animation });
    try {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
      setup({ morphFrom: { left: 100, top: 100, width: 800, height: 500 } });
      await flushPromises();
      expect(document.body.querySelector('.export-status-host')?.classList.contains('morphing')).toBe(true);
      await advance(10_000);
      expectOpen();
      finish();
      await flushPromises();
      expect(document.body.querySelector('.export-status-host')?.classList.contains('morphing')).toBe(false);
      await advance(4_999);
      expectOpen();
      await advance(1);
      expectClosed();
    } finally {
      if (descriptor) Object.defineProperty(Element.prototype, 'animate', descriptor);
      else Reflect.deleteProperty(Element.prototype, 'animate');
    }
  });

  it('gives the user five new seconds when a completed export returns from a hidden editor', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    setup();
    await advance(4_000);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(60_000);
    expectOpen();
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(4_999);
    expectOpen();
    await advance(1);
    expectClosed();
  });
});
