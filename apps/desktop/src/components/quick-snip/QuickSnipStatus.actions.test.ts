import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setCurrentLocale } from '~/i18n';
import type { QuickSnipSnapshot, QuickSnipRenderTask } from '~/api/types/quick-snip';
import QuickSnipStatus from './QuickSnipStatus.vue';
const api = vi.hoisted(() => ({
  getQuickSnipState: vi.fn(),
  getQuickSnipRenderTask: vi.fn(),
  onQuickSnipStatus: vi.fn((_value: (snapshot: QuickSnipSnapshot) => void) => vi.fn()),
  onQuickSnipRenderTask: vi.fn((_value: (task: QuickSnipRenderTask | null) => void) => vi.fn()),
  onQuickSnipStatusBlur: vi.fn((_value: () => void) => vi.fn()),
  setQuickSnipStatusInteractive: vi.fn(),
  notifyQuickSnipStatusReady: vi.fn(),
  reportQuickSnipRender: vi.fn(),
  openQuickSnipEditor: vi.fn(),
  quickSnipCancel: vi.fn(),
  dismissQuickSnipStatus: vi.fn(),
  copyQuickSnipFile: vi.fn(),
  getScreenshot: vi.fn(),
  exportScreenshot: vi.fn(),
  listBackgroundLibrary: vi.fn(),
}));
const render = vi.hoisted(() => vi.fn());
const encode = vi.hoisted(() => vi.fn());
vi.mock('~/api/capture', () => ({ capture: api }));
vi.mock('./quick-snip-export', () => ({ renderQuickSnip: render }));
vi.mock('../screenshot/screenshot-render', () => ({ encodeScreenshot: encode }));
vi.mock('../screenshot/screenshot-state', () => ({ screenshotState: () => ({ canvas: {}, format: 'webp' }) }));
enableAutoUnmount(afterEach);
const snapshot = (patch: Partial<QuickSnipSnapshot> = {}) =>
  ({
    state: 'completed',
    job: {
      name: 'job',
      projectId: 'project',
      mode: 'instant',
      format: 'mp4',
      preset: { id: 'saved', name: 'My preset' },
    },
    progress: 1,
    result: { path: '/exports/demo.mp4', projectId: 'project' },
    error: null,
    ...patch,
  }) as QuickSnipSnapshot;
const setup = async (value = snapshot()) => {
  api.getQuickSnipState.mockResolvedValueOnce(value);
  const wrapper = mount(QuickSnipStatus, { global: { stubs: { Beamy: true } } });
  await flushPromises();
  return wrapper;
};
const action = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper
    .findAll('button')
    .find((button) => button.text().trim() === text || button.attributes('aria-label') === text)!;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(async () => {
  vi.clearAllMocks();
  await setCurrentLocale('en');
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  api.getQuickSnipRenderTask.mockResolvedValue(null);
  api.reportQuickSnipRender.mockResolvedValue(undefined);
  api.openQuickSnipEditor.mockResolvedValue(undefined);
  api.quickSnipCancel.mockResolvedValue(undefined);
  api.copyQuickSnipFile.mockResolvedValue(undefined);
  api.getScreenshot.mockResolvedValue({ id: 'project', source: 'image.png' });
  api.listBackgroundLibrary.mockResolvedValue([]);
  api.exportScreenshot.mockResolvedValue({ status: 'copied' });
  render.mockReset().mockResolvedValue(undefined);
  encode.mockResolvedValue(new ArrayBuffer(8));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('keeps native drag opt-in and copies the finished file without opening an editor', async () => {
  const wrapper = await setup();
  expect(wrapper.get('.snip-surface').classes()).toContain('native-draggable');
  await action(wrapper, 'Copy').trigger('click');
  await flushPromises();
  expect(api.copyQuickSnipFile).toHaveBeenCalledWith('/exports/demo.mp4');
  expect(wrapper.get('[role="status"]').text()).toContain('Copied');
  expect(api.openQuickSnipEditor).not.toHaveBeenCalled();
});
it('re-encodes a screenshot as PNG before copying, preserving the saved WebP settings', async () => {
  const value = snapshot();
  value.job!.mode = 'screenshot';
  const wrapper = await setup(value);
  await action(wrapper, 'Copy').trigger('click');
  await flushPromises();
  expect(encode).toHaveBeenCalledWith('image.png', expect.objectContaining({ format: 'png' }));
  expect(api.exportScreenshot).toHaveBeenCalledWith('project', expect.any(ArrayBuffer), 'png', true);
  expect(api.copyQuickSnipFile).not.toHaveBeenCalled();
});
it('does not publish an unavailable result and dismisses a completed widget independently', async () => {
  const wrapper = await setup(snapshot({ result: null }));
  await action(wrapper, 'Copy').trigger('click');
  await flushPromises();
  expect(api.copyQuickSnipFile).not.toHaveBeenCalled();
  await action(wrapper, 'Dismiss').trigger('click');
  expect(api.dismissQuickSnipStatus).toHaveBeenCalledOnce();
});
it('keeps the action panel interactive while opening an editor and ignores a simultaneous action', async () => {
  const pending = deferred<void>();
  api.openQuickSnipEditor.mockReturnValueOnce(pending.promise);
  const wrapper = await setup();
  const first = action(wrapper, 'Open in editor').trigger('click');
  const second = action(wrapper, 'Copy').trigger('click');
  await Promise.all([first, second]);
  expect(api.openQuickSnipEditor).toHaveBeenCalledOnce();
  expect(api.copyQuickSnipFile).not.toHaveBeenCalled();
  expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('false');
  pending.resolve();
  await flushPromises();
  expect(action(wrapper, 'Copy').attributes('disabled')).toBeUndefined();
});
it.each([new Error('Editor unavailable'), 'Native failure'])(
  'keeps a failed action readable and allows another attempt (%s)',
  async (reason) => {
    api.openQuickSnipEditor.mockRejectedValueOnce(reason);
    const wrapper = await setup();
    await action(wrapper, 'Open in editor').trigger('click');
    await flushPromises();
    expect(wrapper.get('.status-error').text()).toBe(
      reason instanceof Error ? reason.message : 'The action failed. Please try again.',
    );
    await action(wrapper, 'Open in editor').trigger('click');
    await flushPromises();
    expect(wrapper.find('.status-error').exists()).toBe(false);
  },
);
it('cancels a running capture through the real native action and dismisses a failed status', async () => {
  const wrapper = await setup(snapshot({ state: 'processing', progress: 0.4, result: null }));
  await action(wrapper, 'Cancel').trigger('click');
  await flushPromises();
  expect(api.quickSnipCancel).toHaveBeenCalledOnce();
  api.onQuickSnipStatus.mock.calls[0]![0](snapshot({ state: 'failed', error: 'Failed' }));
  await flushPromises();
  await action(wrapper, 'Dismiss').trigger('click');
  expect(api.dismissQuickSnipStatus).toHaveBeenCalledOnce();
});
it.each([30, 61])('reports a useful remaining-time estimate for %ss', async (etaSeconds) => {
  const wrapper = await setup(snapshot({ state: 'processing', progress: Number.NaN, etaSeconds }));
  expect(wrapper.get('.status-copy').text()).toContain(etaSeconds < 60 ? '30 s' : '2 min');
  expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
});
it('retains saved-project guidance after failure and a safe message when there is no project', async () => {
  const wrapper = await setup(snapshot({ state: 'failed' }));
  expect(wrapper.get('.status-copy').text()).toContain('saved');
  api.onQuickSnipStatus.mock.calls[0]![0](snapshot({ state: 'failed', job: null, result: null }));
  await flushPromises();
  expect(wrapper.get('.status-copy').text()).toContain('Export failed');
});
it('does not let an old initial snapshot overwrite a newer native event', async () => {
  const initial = deferred<QuickSnipSnapshot>();
  api.getQuickSnipState.mockReturnValueOnce(initial.promise);
  const wrapper = mount(QuickSnipStatus, { global: { stubs: { Beamy: true } } });
  api.onQuickSnipStatus.mock.calls[0]![0](snapshot({ state: 'processing', progress: 0.8 }));
  initial.resolve(snapshot({ state: 'preparing', progress: 0 }));
  await flushPromises();
  expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('80');
});
it('reports startup failure without failing native-window hydration', async () => {
  api.getQuickSnipState.mockRejectedValueOnce(new Error('No state'));
  api.getQuickSnipRenderTask.mockRejectedValueOnce(new Error('No task'));
  const wrapper = mount(QuickSnipStatus, { global: { stubs: { Beamy: true } } });
  await flushPromises();
  expect(wrapper.find('.status-error').exists()).toBe(true);
  expect(api.notifyQuickSnipStatusReady).not.toHaveBeenCalled();
});
it('shares keyboard focus inside its actions and releases native interactivity on blur', async () => {
  const wrapper = await setup();
  const surface = wrapper.get('.snip-surface');
  await surface.trigger('focusin');
  await surface.trigger('focusout', { relatedTarget: action(wrapper, 'Copy').element });
  expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('false');
  await surface.trigger('focusout', { relatedTarget: document.body });
  expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('true');
  await surface.trigger('mouseenter');
  await surface.trigger('mouseleave');
  api.onQuickSnipStatusBlur.mock.calls[0]![0]();
  await flushPromises();
  expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('true');
});
it('keeps a native hover bridge and cleans up a pending leave when unmounted', async () => {
  const wrapper = await setup();
  vi.useFakeTimers();
  const surface = wrapper.get('.snip-surface');
  await surface.trigger('mouseenter');
  await surface.trigger('mouseleave');
  await vi.advanceTimersByTimeAsync(100);
  await surface.trigger('mouseenter');
  await vi.advanceTimersByTimeAsync(300);
  expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('false');
  await surface.trigger('mouseleave');
  wrapper.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('starts a render once per task and aborts it when native capture replaces or removes it', async () => {
  await setup();
  const receive = api.onQuickSnipRenderTask.mock.calls[0]![0];
  const task = { id: 'task-1' } as QuickSnipRenderTask;
  receive(task);
  await flushPromises();
  receive(task);
  await flushPromises();
  expect(render).toHaveBeenCalledOnce();
  const signal = render.mock.calls[0]![1] as AbortSignal;
  receive({ id: 'task-2' } as QuickSnipRenderTask);
  await flushPromises();
  expect(signal.aborted).toBe(true);
  const next = render.mock.calls[1]![1] as AbortSignal;
  receive(null);
  expect(next.aborted).toBe(true);
});
it.each([new Error('Render failed'), 'Renderer rejected'])(
  'reports a real render failure back to its native job (%s)',
  async (reason) => {
    render.mockRejectedValueOnce(reason);
    api.reportQuickSnipRender.mockRejectedValueOnce(new Error('Window closed'));
    await setup();
    api.onQuickSnipRenderTask.mock.calls[0]![0]({ id: 'failed' } as QuickSnipRenderTask);
    await flushPromises();
    expect(api.reportQuickSnipRender).toHaveBeenCalledWith({
      id: 'failed',
      type: 'failed',
      error: reason instanceof Error ? reason.message : reason,
    });
  },
);
it('ignores a cancelled render failure and an outdated initial render task', async () => {
  const initial = deferred<QuickSnipRenderTask | null>();
  api.getQuickSnipRenderTask.mockReturnValueOnce(initial.promise);
  const pending = deferred<void>();
  render.mockReturnValueOnce(pending.promise);
  await setup();
  const receive = api.onQuickSnipRenderTask.mock.calls[0]![0];
  receive({ id: 'new' } as QuickSnipRenderTask);
  await flushPromises();
  initial.resolve({ id: 'old' } as QuickSnipRenderTask);
  await flushPromises();
  expect(render).toHaveBeenCalledOnce();
  receive(null);
  pending.reject(new Error('Cancelled'));
  await flushPromises();
  expect(api.reportQuickSnipRender).not.toHaveBeenCalled();
});
it('aborts before starting a task whose status renderer was disposed during import', async () => {
  const wrapper = await setup();
  api.onQuickSnipRenderTask.mock.calls[0]![0]({ id: 'late' } as QuickSnipRenderTask);
  wrapper.unmount();
  await flushPromises();
  expect(render).not.toHaveBeenCalled();
});
