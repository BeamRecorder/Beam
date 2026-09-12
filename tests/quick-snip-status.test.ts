import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickSnipRenderTask, QuickSnipSnapshot } from '~/api/types/quick-snip';
import messages from '../src/i18n/en/core.json';
const mocks = vi.hoisted(() => ({
  status: null as ((value: QuickSnipSnapshot) => void) | null,
  renderTask: null as ((value: QuickSnipRenderTask | null) => unknown) | null,
  renderQuickSnip: vi.fn(),
  capture: {
    onQuickSnipStatus: vi.fn(),
    getQuickSnipState: vi.fn(),
    onQuickSnipRenderTask: vi.fn(),
    getQuickSnipRenderTask: vi.fn(),
    reportQuickSnipRender: vi.fn(),
    copyQuickSnipFile: vi.fn(),
    quickSnipCancel: vi.fn(),
    openEditor: vi.fn(),
    openQuickSnipEditor: vi.fn(),
    setQuickSnipStatusInteractive: vi.fn(),
    dismissQuickSnipStatus: vi.fn(),
  },
}));
vi.mock('~/api/capture', () => ({ capture: mocks.capture }));
vi.mock('../src/components/quick-snip/quick-snip-export', () => ({ renderQuickSnip: mocks.renderQuickSnip }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: keyof typeof messages.QuickSnipStatus, values?: { time: string }) =>
      messages.QuickSnipStatus[key].replace('{time}', values?.time ?? ''),
  }),
}));
import QuickSnipStatus from '../src/components/quick-snip/QuickSnipStatus.vue';
const snapshot: QuickSnipSnapshot = {
  state: 'processing',
  progress: 0.42,
  etaSeconds: 12,
  result: null,
  error: null,
  job: {
    mode: 'studio',
    format: 'mp4',
    name: 'Snip',
    preset: {
      id: 'default',
      name: 'Default',
      protected: true,
      updatedAt: '',
      settings: { editor: { schemaVersion: 1 }, devices: {}, export: {}, quickSnip: { automaticZoom: true } },
    },
    automaticZoom: true,
    screenKind: 'display',
    region: { x: 0, y: 0, width: 1, height: 1 },
    regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    displayId: '1',
    devices: {},
    projectId: 'project',
    thumbnail: 'data:image/jpeg;base64,thumbnail',
  },
};
const completed = {
  ...snapshot,
  state: 'completed',
  progress: 1,
  copied: true,
  result: { path: '/video.mp4', projectId: 'project' },
} satisfies QuickSnipSnapshot;
const clipboardWriteText = vi.fn<(text: string) => Promise<void>>();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.renderTask = null;
  mocks.capture.onQuickSnipStatus.mockImplementation((listener) => {
    mocks.status = listener;
    return vi.fn();
  });
  mocks.capture.onQuickSnipRenderTask.mockImplementation((listener) => {
    mocks.renderTask = listener;
    return vi.fn();
  });
  mocks.capture.getQuickSnipRenderTask.mockResolvedValue(null);
  mocks.capture.reportQuickSnipRender.mockResolvedValue(undefined);
  mocks.renderQuickSnip.mockResolvedValue(undefined);
  mocks.capture.getQuickSnipState.mockResolvedValue(snapshot);
  mocks.capture.copyQuickSnipFile.mockResolvedValue({ native: true, fallback: null });
  mocks.capture.quickSnipCancel.mockResolvedValue({ state: 'canceled' });
  mocks.capture.openEditor.mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const setup = async (value = snapshot) => {
  const wrapper = mount(QuickSnipStatus);
  mocks.status?.(value);
  await flushPromises();
  return wrapper;
};
describe('Quick Snip status pill', () => {
  it('opens its details below when requested by the native window and tracks later placement updates', async () => {
    const wrapper = await setup({ ...snapshot, popoverSide: 'below' });
    expect(wrapper.classes()).toContain('opens-below');

    mocks.status?.({ ...snapshot, popoverSide: 'above' });
    await flushPromises();
    expect(wrapper.classes()).not.toContain('opens-below');
    wrapper.unmount();
  });

  it('shows a thumbnail, real progress and ETA immediately in compact view', async () => {
    const wrapper = await setup();
    expect(wrapper.get('.thumbnail img').attributes('src')).toContain('thumbnail');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('42');
    expect(wrapper.text()).toContain('12 s remaining');
    expect(wrapper.get('.progress i').attributes('style')).toContain('scaleX(0.42)');
    expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
  it('keeps actions expanded and interactive for 300ms after mouse leaves', async () => {
    const wrapper = await setup();
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      await surface.trigger('mouseenter');
      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(299);
      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.classes()).not.toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('cancels the delayed collapse when the pointer re-enters', async () => {
    const wrapper = await setup();
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      await surface.trigger('mouseenter');
      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(299);
      await surface.trigger('mouseenter');
      await vi.advanceTimersByTimeAsync(1);

      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.classes()).not.toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('clears the delayed hover-close timer when unmounted', async () => {
    const wrapper = await setup();
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      await surface.trigger('mouseenter');
      await surface.trigger('mouseleave');
      expect(vi.getTimerCount()).toBe(1);

      wrapper.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('keeps actions exposed for keyboard focus after the mouse leaves', async () => {
    const wrapper = await setup();
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      await surface.trigger('mouseenter');
      await surface.trigger('focusin');
      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(300);

      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      await surface.trigger('focusout');
      expect(wrapper.classes()).not.toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('keeps keyboard focus active when it moves within the status surface', async () => {
    const wrapper = await setup();
    const surface = wrapper.get('.snip-surface');

    await surface.trigger('focusin');
    await surface.trigger('focusout', { relatedTarget: wrapper.get('.snip-pill').element });
    expect(wrapper.classes()).toContain('expanded');
    expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

    await surface.trigger('focusout', { relatedTarget: document.body });
    expect(wrapper.classes()).not.toContain('expanded');
    expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    wrapper.unmount();
  });
  it('expands for error details without hover and synchronizes native interactivity when errors change', async () => {
    const wrapper = await setup({ ...snapshot, error: 'Native screen capture failed.' });
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      expect(wrapper.classes()).toContain('expanded');
      expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('false');
      expect(wrapper.get('.status-error').element.textContent).toBe('Native screen capture failed.');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      await surface.trigger('mouseenter');
      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      mocks.status?.({ ...snapshot, error: null });
      await flushPromises();
      expect(wrapper.classes()).not.toContain('expanded');
      expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('true');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('keeps a terminal failure expanded and dismissible without hover even without error text', async () => {
    const wrapper = await setup({ ...snapshot, state: 'failed', error: null });

    expect(wrapper.classes()).toContain('expanded');
    expect(wrapper.get('.snip-details').attributes('aria-hidden')).toBe('false');
    expect(wrapper.get('[aria-label="Dismiss"]').attributes('disabled')).toBeUndefined();
    expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);
    wrapper.unmount();
  });
  it('copies the full untruncated failure details through the native CopyButton', async () => {
    const error = Array.from(
      { length: 30 },
      (_, index) => `Native failure detail ${index}: capture backend error`,
    ).join('\n');
    clipboardWriteText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWriteText } });
    const wrapper = await setup({ ...snapshot, state: 'failed', error });

    const errorText = wrapper.get('.status-error');
    expect(errorText.element.textContent).toBe(error);
    const copyButton = wrapper.get('.error-row button.copy-button-idle');
    expect(copyButton.attributes('title')).toBe(copyButton.attributes('aria-label'));
    expect(wrapper.find('.error-row .tooltip-wrapper').exists()).toBe(false);

    await copyButton.trigger('click');
    await flushPromises();

    expect(clipboardWriteText).toHaveBeenCalledWith(error);
    expect(wrapper.get('.status-error').element.textContent).toBe(error);
    wrapper.unmount();
  });
  it('allows dismissing a terminal failure while the editor action is still pending', async () => {
    let resolveEditor!: (opened: boolean) => void;
    mocks.capture.openQuickSnipEditor.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveEditor = resolve;
      }),
    );
    const wrapper = await setup({ ...snapshot, state: 'failed', error: 'Native capture failed.' });
    const openEditor = wrapper.findAll('button').find((item) => item.text().includes('Open in editor'))!;
    const opening = openEditor.trigger('click');
    await wrapper.vm.$nextTick();

    const dismiss = wrapper.get('button[aria-label="Dismiss"]');
    expect(dismiss.attributes('disabled')).toBeUndefined();
    await dismiss.trigger('click');
    expect(mocks.capture.dismissQuickSnipStatus).toHaveBeenCalledOnce();

    resolveEditor(true);
    await Promise.all([opening, flushPromises()]);
    wrapper.unmount();
  });
  it('starts each render task once and ignores duplicate task notifications', async () => {
    const initialTask = { id: 'render-1' } as QuickSnipRenderTask;
    const nextTask = { id: 'render-2' } as QuickSnipRenderTask;
    mocks.capture.getQuickSnipRenderTask.mockResolvedValueOnce(initialTask);
    const wrapper = await setup();

    expect(mocks.renderQuickSnip).toHaveBeenCalledOnce();
    expect(mocks.renderQuickSnip).toHaveBeenCalledWith(initialTask, expect.any(AbortSignal));
    mocks.renderTask?.(initialTask);
    expect(mocks.renderQuickSnip).toHaveBeenCalledOnce();
    mocks.renderTask?.(nextTask);
    await flushPromises();
    expect(mocks.renderQuickSnip).toHaveBeenCalledTimes(2);

    const signal = mocks.renderQuickSnip.mock.calls[0]![1] as AbortSignal;
    wrapper.unmount();
    expect(signal.aborted).toBe(true);
  });
  it.each([
    [new Error('render worker failed'), 'render worker failed'],
    ['render worker failed without Error', 'render worker failed without Error'],
  ])('reports Quick Snip render failure details', async (reason, expectedError) => {
    const task = { id: 'render-failed' } as QuickSnipRenderTask;
    mocks.capture.getQuickSnipRenderTask.mockResolvedValueOnce(task);
    mocks.renderQuickSnip.mockRejectedValueOnce(reason);
    const wrapper = await setup();

    expect(mocks.capture.reportQuickSnipRender).toHaveBeenCalledWith({
      id: task.id,
      type: 'failed',
      error: expectedError,
    });
    wrapper.unmount();
  });
  it('suppresses a render failure report after its renderer has been unmounted', async () => {
    const task = { id: 'render-canceled' } as QuickSnipRenderTask;
    let rejectRender!: (reason: unknown) => void;
    mocks.capture.getQuickSnipRenderTask.mockResolvedValueOnce(task);
    mocks.renderQuickSnip.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectRender = reject;
      }),
    );
    const wrapper = await setup();

    expect(mocks.renderQuickSnip).toHaveBeenCalledOnce();
    wrapper.unmount();
    rejectRender(new Error('stale render failure'));
    await flushPromises();
    expect(mocks.capture.reportQuickSnipRender).not.toHaveBeenCalled();
  });
  it('aborts a handed-off renderer without reporting failure and gives the next task a fresh signal', async () => {
    const firstTask = { id: 'render-handed-off' } as QuickSnipRenderTask;
    const nextTask = { id: 'render-next' } as QuickSnipRenderTask;
    let rejectFirstRender!: (reason: unknown) => void;
    let resolveNextRender!: () => void;
    mocks.renderQuickSnip
      .mockReturnValueOnce(
        new Promise<void>((_resolve, reject) => {
          rejectFirstRender = reject;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveNextRender = resolve;
        }),
      );
    const wrapper = await setup();

    mocks.renderTask?.(firstTask);
    await flushPromises();
    const firstSignal = mocks.renderQuickSnip.mock.calls[0]![1] as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    mocks.renderTask?.(null);
    expect(firstSignal.aborted).toBe(true);
    rejectFirstRender(new Error('renderer stopped during handoff'));
    await flushPromises();
    expect(mocks.capture.reportQuickSnipRender).not.toHaveBeenCalled();

    mocks.renderTask?.(nextTask);
    await flushPromises();
    const nextSignal = mocks.renderQuickSnip.mock.calls[1]![1] as AbortSignal;
    expect(nextSignal).not.toBe(firstSignal);
    expect(nextSignal.aborted).toBe(false);
    expect(mocks.renderQuickSnip).toHaveBeenCalledTimes(2);

    resolveNextRender();
    await flushPromises();
    expect(mocks.capture.reportQuickSnipRender).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each([
    ['null task', null],
    ['older task', { id: 'render-stale' } as QuickSnipRenderTask],
  ])('ignores a late initial %s snapshot after a newer task event', async (_description, initialTask) => {
    let resolveInitialTask!: (task: QuickSnipRenderTask | null) => void;
    mocks.capture.getQuickSnipRenderTask.mockReturnValueOnce(
      new Promise<QuickSnipRenderTask | null>((resolve) => {
        resolveInitialTask = resolve;
      }),
    );
    const wrapper = await setup();
    const currentTask = { id: 'render-current' } as QuickSnipRenderTask;

    mocks.renderTask?.(currentTask);
    await flushPromises();
    const currentSignal = mocks.renderQuickSnip.mock.calls[0]![1] as AbortSignal;
    expect(currentSignal.aborted).toBe(false);

    resolveInitialTask(initialTask);
    await flushPromises();
    expect(mocks.renderQuickSnip).toHaveBeenCalledOnce();
    expect(mocks.renderQuickSnip).toHaveBeenCalledWith(currentTask, currentSignal);
    expect(currentSignal.aborted).toBe(false);
    wrapper.unmount();
  });
  it('ignores a failed initial render-task lookup', async () => {
    mocks.capture.getQuickSnipRenderTask.mockRejectedValueOnce(new Error('render task unavailable'));
    const wrapper = await setup();

    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('42');
    expect(mocks.capture.reportQuickSnipRender).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows an actionable error when the initial status lookup fails', async () => {
    mocks.capture.getQuickSnipState.mockRejectedValueOnce(new Error('status unavailable'));
    const wrapper = mount(QuickSnipStatus);
    await flushPromises();

    expect(wrapper.classes()).toContain('expanded');
    expect(wrapper.get('.status-error').text()).toBe(messages.QuickSnipStatus.actionFailed);
    expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);
    wrapper.unmount();
  });
  it('uses the latest rendered frame and clamps invalid progress', async () => {
    const wrapper = await setup({
      ...snapshot,
      preview: 'data:image/jpeg;base64,frame',
      progress: Number.NaN,
      etaSeconds: null,
    });
    expect(wrapper.get('.thumbnail img').attributes('src')).toContain('frame');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
    expect(wrapper.text()).toContain('Estimating time');
    wrapper.unmount();
  });
  it('opens the retained editor after cancelling an in-flight export', async () => {
    const wrapper = await setup();
    const button = wrapper.findAll('button').find((item) => item.text().includes('Open in editor'))!;
    await button.trigger('click');
    await flushPromises();
    expect(mocks.capture.openQuickSnipEditor).toHaveBeenCalledOnce();
    expect(mocks.capture.quickSnipCancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('offers the translated Copy action and dismiss on success without cancelling the recording', async () => {
    const wrapper = await setup(completed);
    expect(wrapper.text()).toContain('Copied to clipboard');
    const copyButton = wrapper.get('button[aria-label="Copy"]');
    expect(copyButton.text()).toBe('Copy');
    expect(copyButton.attributes('title')).toBe('Copy');
    expect(copyButton.find('svg').exists()).toBe(true);
    await copyButton.trigger('click');
    await flushPromises();
    expect(mocks.capture.copyQuickSnipFile).toHaveBeenCalledWith('/video.mp4');
    await wrapper.get('[aria-label="Dismiss"]').trigger('click');
    expect(mocks.capture.dismissQuickSnipStatus).toHaveBeenCalled();
    expect(mocks.capture.quickSnipCancel).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('keeps actions interactive after the hover delay while copying is pending', async () => {
    let resolveCopy!: (result: { native: true; fallback: null }) => void;
    mocks.capture.copyQuickSnipFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCopy = resolve;
      }),
    );
    const wrapper = await setup(completed);
    vi.useFakeTimers();
    try {
      const surface = wrapper.get('.snip-surface');
      await surface.trigger('mouseenter');
      await wrapper.get('button[aria-label="Copy"]').trigger('click');
      await flushPromises();
      expect(wrapper.get('button[aria-label="Copy"]').attributes('disabled')).toBeDefined();

      await surface.trigger('mouseleave');
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.classes()).toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(true);

      resolveCopy({ native: true, fallback: null });
      await flushPromises();
      expect(wrapper.classes()).not.toContain('expanded');
      expect(mocks.capture.setQuickSnipStatusInteractive).toHaveBeenLastCalledWith(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
  it('keeps copy failures visible and allows a retry', async () => {
    mocks.capture.copyQuickSnipFile.mockRejectedValueOnce(new Error('Clipboard busy'));
    const wrapper = await setup({ ...completed, copied: false });
    const button = wrapper.get('[aria-label="Copy"]');
    await button.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Clipboard busy');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not offer editor access for a raw capture', async () => {
    const wrapper = await setup({ ...snapshot, job: { ...snapshot.job!, mode: 'raw' } });
    expect(wrapper.text()).not.toContain('Open in editor');
    await wrapper
      .findAll('button')
      .find((item) => item.text().includes('Cancel'))!
      .trigger('click');
    expect(mocks.capture.quickSnipCancel).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not overwrite a pushed state with an older initial snapshot', async () => {
    const wrapper = await setup(completed);
    expect(wrapper.text()).toContain('Copied to clipboard');
    wrapper.unmount();
  });
});
