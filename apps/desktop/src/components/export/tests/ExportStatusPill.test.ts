import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { setCurrentLocale } from '~/i18n';
import ExportStatusPill from '../ExportStatusPill.vue';

const api = {
  openFile: vi.fn<(path: string) => Promise<void>>(),
  showItemInFolder: vi.fn<(path: string) => Promise<void>>(),
};
const writeText = vi.fn<(text: string) => Promise<void>>();
const wrappers: ReturnType<typeof mount>[] = [];
let reducedMotion = true;
const Beamy = defineComponent({
  props: ['phase', 'celebrate', 'melt'],
  template: '<span data-beamy :data-phase="phase" :data-celebrate="celebrate" :data-melt="melt" />',
});
const setup = (props: Partial<InstanceType<typeof ExportStatusPill>['$props']> = {}) => {
  const wrapper = mount(ExportStatusPill, {
    props: { state: 'working', name: 'Walkthrough', format: 'mp4', ...props },
    attachTo: document.body,
    global: { stubs: { Beamy } },
  });
  wrappers.push(wrapper);
  return wrapper;
};
const element = (selector: string) => {
  const found = document.body.querySelector<HTMLElement>(selector);
  expect(found, `Missing ${selector}`).not.toBeNull();
  return new DOMWrapper(found!);
};
const action = (label: string) => {
  const found = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.export-status-host button')).find(
    (button) => button.getAttribute('aria-label') === label || button.textContent?.trim() === label,
  );
  expect(found, `Missing action ${label}`).toBeDefined();
  return new DOMWrapper(found!);
};
const hasAction = (label: string) =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>('.export-status-host button')).some(
    (button) => button.getAttribute('aria-label') === label || button.textContent?.trim() === label,
  );
const expanded = () => element('.snip-details').attributes('aria-hidden') === 'false';
const hover = () => element('.snip-surface').trigger('mouseenter');
const leave = () => element('.snip-surface').trigger('mouseleave');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

beforeEach(async () => {
  await setCurrentLocale('en');
  reducedMotion = true;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...media,
    matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
  }));
  api.openFile.mockReset().mockResolvedValue(undefined);
  api.showItemInFolder.mockReset().mockResolvedValue(undefined);
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, 'capture', { configurable: true, value: api });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  await setCurrentLocale('en');
});

describe('ExportStatusPill presentation', () => {
  it('teleports a non-modal, keyboard-focusable status to the editor body', () => {
    setup({ progress: 0.42 });
    expect(document.body.querySelector('.export-status-host')).not.toBeNull();
    expect(element('.snip-pill').attributes('tabindex')).toBe('0');
    expect(element('[role="status"]').text()).toContain('Exporting video');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(expanded()).toBe(false);
    expect(element('.snip-details').attributes('inert')).toBeDefined();
  });

  it.each([
    [0, '0'],
    [0.426, '43'],
    [1, '100'],
    [1.4, '100'],
    [-0.6, '0'],
  ])('publishes a bounded percentage for progress %s', (progress, expected) => {
    setup({ progress });
    expect(element('[role="progressbar"]').attributes('aria-valuenow')).toBe(expected);
    expect(element('[role="progressbar"]').attributes('aria-valuemin')).toBe('0');
    expect(element('[role="progressbar"]').attributes('aria-valuemax')).toBe('100');
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not invent a percentage for indeterminate progress %s',
    (progress) => {
      setup({ progress });
      expect(element('[role="progressbar"]').attributes('aria-valuenow')).toBeUndefined();
      expect(element('.status-value').text()).not.toContain('%');
    },
  );

  it('keeps the same mascot while working and replaces it with direct file actions at completion', async () => {
    const wrapper = setup({ progress: 0, stageLabel: 'Preparing assets' });
    const mascot = element('[data-beamy]').element;
    expect(element('[data-beamy]').attributes('data-phase')).toBe('loading');
    await wrapper.setProps({
      progress: 0.5,
      stageLabel: 'Encoding frame 50 / 100',
    });
    expect(element('[data-beamy]').element).toBe(mascot);
    expect(element('[data-beamy]').attributes('data-phase')).toBe('loading');
    expect(element('[role="status"]').text()).toContain('Encoding frame 50 / 100');
    await wrapper.setProps({ progress: 1 });
    expect(element('[data-beamy]').attributes('data-phase')).toBe('loading');
    expect(document.body.querySelector('.success-mark')).toBeNull();
    await wrapper.setProps({
      state: 'completed',
      filePath: '/exports/walkthrough.mp4',
    });
    expect(document.body.querySelector('[data-beamy]')).toBeNull();
    expect(element('[role="status"]').text()).toContain('Video ready');
    expect(document.body.querySelector('.success-mark')).not.toBeNull();
    expect(document.body.querySelector('[role="progressbar"]')).toBeNull();
    expect(
      Array.from(element('.snip-pill').element.querySelectorAll('button')).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Watch', 'Open folder']);
    expect(element('.snip-details').text()).not.toContain('Open folder');
  });

  it('replaces the mascot immediately with a checkmark and file actions, retaining the aura', async () => {
    reducedMotion = false;
    const wrapper = setup({ progress: 0.5 });
    expect(document.body.querySelector('[data-beamy]')).not.toBeNull();
    await wrapper.setProps({ state: 'completed', progress: 1, filePath: '/exports/finished.mp4' });
    expect(document.body.querySelector('[data-beamy]')).toBeNull();
    expect(document.body.querySelector('.mascot-melt')).toBeNull();
    expect(document.body.querySelector('.celebrating')).toBeNull();
    expect(document.body.querySelector('.success-mark svg')).not.toBeNull();
    expect(hasAction('Watch')).toBe(true);
    expect(hasAction('Open folder')).toBe(true);
    expect(element('.completion-aura').attributes('aria-hidden')).toBe('true');
  });

  it('removes the checkmark and aura when a new export replaces the finished job', async () => {
    vi.useFakeTimers();
    const wrapper = setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    expect(document.body.querySelector('.success-mark')).not.toBeNull();
    await wrapper.setProps({ state: 'working', name: 'New export', filePath: null });
    expect(element('[data-beamy]').attributes('data-phase')).toBe('loading');
    expect(document.body.querySelector('.completion-aura')).toBeNull();
    expect(document.body.querySelector('.success-mark')).toBeNull();
    expect(hasAction('Watch')).toBe(false);
    expect(document.body.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up pending presentation frames when the editor is disposed', () => {
    vi.useFakeTimers();
    const wrapper = setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.body.querySelector('.export-status-host')).toBeNull();
  });

  it('renders the real preview and authored metadata without exposing them as another dialog', async () => {
    setup({
      preview: 'data:image/jpeg;base64,AAAA',
      detail: 'Frame 42 / 100',
      progress: 0.42,
    });
    expect(element('.thumbnail img').attributes('src')).toBe('data:image/jpeg;base64,AAAA');
    expect(element('.thumbnail img').attributes('alt')).toBe('');
    expect(element('.status-copy').text()).toContain('Frame 42 / 100');
    await hover();
    expect(element('.snip-details').text()).toContain('Walkthrough');
    expect(element('.snip-details').text()).toContain('MP4');
  });

  it('uses image status and file actions for screenshots', async () => {
    const wrapper = setup({ kind: 'image', format: 'webp' });
    expect(element('[role="status"]').text()).toContain('Exporting image');
    await wrapper.setProps({
      state: 'completed',
      filePath: '/exports/still.webp',
    });
    expect(element('[role="status"]').text()).toContain('Image ready');
    expect(hasAction('View image')).toBe(true);
    expect(hasAction('Watch')).toBe(false);
    expect(action('View image').element.closest('.snip-pill')).not.toBeNull();
    expect(action('Open folder').element.closest('.snip-pill')).not.toBeNull();
  });

  it('localizes both the image status and result actions in French', async () => {
    await setCurrentLocale('fr');
    setup({
      kind: 'image',
      format: 'png',
      state: 'completed',
      filePath: '/exports/image.png',
    });
    expect(element('[role="status"]').text()).toContain('Image prête');
    expect(hasAction('Ouvrir le dossier')).toBe(true);
    expect(hasAction('Voir l’image')).toBe(true);
  });
});

describe('ExportStatusPill interaction', () => {
  it('opens on hover, bridges exits for 300 ms, and cancels the close on reentry', async () => {
    vi.useFakeTimers();
    setup();
    await hover();
    expect(expanded()).toBe(true);
    expect(element('.snip-details').attributes('inert')).not.toBe('true');
    await leave();
    await vi.advanceTimersByTimeAsync(299);
    expect(expanded()).toBe(true);
    await hover();
    await vi.advanceTimersByTimeAsync(10);
    expect(expanded()).toBe(true);
    await leave();
    await vi.advanceTimersByTimeAsync(300);
    expect(expanded()).toBe(false);
    expect(element('.snip-details').attributes('inert')).toBeDefined();
  });

  it('preserves keyboard focus across its own controls and closes after focus leaves', async () => {
    setup();
    await element('.snip-pill').trigger('focusin');
    expect(expanded()).toBe(true);
    await element('.snip-surface').trigger('focusout', {
      relatedTarget: action('Cancel Export').element,
    });
    expect(expanded()).toBe(true);
    const outside = document.createElement('button');
    document.body.append(outside);
    await element('.snip-surface').trigger('focusout', {
      relatedTarget: outside,
    });
    expect(expanded()).toBe(false);
  });

  it('keeps keyboard-focused actions available after the pointer leaves', async () => {
    vi.useFakeTimers();
    setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    await hover();
    const target = action('Watch').element as HTMLButtonElement;
    target.focus();
    vi.spyOn(target, 'matches').mockImplementation((selector) => selector === ':focus-visible');
    await leave();
    await vi.advanceTimersByTimeAsync(300);
    expect(expanded()).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it('emits cancellation only for a working export', async () => {
    const wrapper = setup();
    await hover();
    await action('Cancel Export').trigger('click');
    expect(wrapper.emitted('cancel')).toEqual([[]]);
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    expect(hasAction('Open folder')).toBe(false);
    expect(hasAction('Watch')).toBe(false);
    await wrapper.setProps({ state: 'failed', error: 'Disk full' });
    expect(hasAction('Cancel Export')).toBe(false);
  });

  it.each(['completed', 'failed'] as const)('dismisses %s status without canceling an export', async (state) => {
    const wrapper = setup({
      state,
      error: state === 'failed' ? 'Disk full' : null,
    });
    await hover();
    await action('Dismiss').trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[]]);
    expect(wrapper.emitted('cancel')).toBeUndefined();
  });

  it('keeps successful results available while the user interacts with them', async () => {
    vi.useFakeTimers();
    const wrapper = setup({
      state: 'completed',
      filePath: '/exports/finished.mp4',
    });
    await hover();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(document.body.querySelector('.export-status-host')).not.toBeNull();
    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });

  it('removes its pending hover callback when disposed', async () => {
    vi.useFakeTimers();
    const wrapper = setup();
    await hover();
    await leave();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.body.querySelector('.export-status-host')).toBeNull();
  });
});

describe('ExportStatusPill file actions and errors', () => {
  it.each([
    ['Open folder', 'showItemInFolder'],
    ['Watch', 'openFile'],
  ] as const)('routes %s to the completed file', async (label, method) => {
    setup({ state: 'completed', filePath: 'D:\\Exports\\Walkthrough.mp4' });
    await hover();
    await action(label).trigger('click');
    await flushPromises();
    expect(api[method]).toHaveBeenCalledExactlyOnceWith('D:\\Exports\\Walkthrough.mp4');
  });

  it('opens the actual screenshot file', async () => {
    setup({
      state: 'completed',
      kind: 'image',
      format: 'png',
      filePath: '/exports/image.png',
    });
    await hover();
    await action('View image').trigger('click');
    await flushPromises();
    expect(api.openFile).toHaveBeenCalledExactlyOnceWith('/exports/image.png');
  });

  it.each([null, undefined, ''])('offers no file actions without an output path %s', (filePath) => {
    setup({ state: 'completed', filePath });
    expect(hasAction('Open folder')).toBe(false);
    expect(hasAction('Watch')).toBe(false);
    expect(api.openFile).not.toHaveBeenCalled();
    expect(api.showItemInFolder).not.toHaveBeenCalled();
  });

  it('blocks concurrent file actions and keeps their panel open while pending', async () => {
    vi.useFakeTimers();
    const opening = deferred();
    api.openFile.mockReturnValueOnce(opening.promise);
    setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    await hover();
    await action('Watch').trigger('click');
    expect(action('Watch').attributes('disabled')).toBeDefined();
    expect(action('Open folder').attributes('disabled')).toBeDefined();
    await action('Open folder').trigger('click');
    await leave();
    await vi.advanceTimersByTimeAsync(300);
    expect(expanded()).toBe(true);
    expect(api.openFile).toHaveBeenCalledOnce();
    expect(api.showItemInFolder).not.toHaveBeenCalled();
    opening.resolve();
    await flushPromises();
    expect(expanded()).toBe(false);
    expect(action('Watch').attributes('disabled')).toBeUndefined();
  });

  it('retains a usable dismiss action while opening the completed file', async () => {
    const opening = deferred();
    api.openFile.mockReturnValueOnce(opening.promise);
    const wrapper = setup({
      state: 'completed',
      filePath: '/exports/finished.mp4',
    });
    await hover();
    await action('Watch').trigger('click');
    expect(action('Dismiss').attributes('disabled')).toBeUndefined();
    await action('Dismiss').trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[]]);
    opening.resolve();
    await flushPromises();
  });

  it('shows and copies a real file-opening failure without hiding the output actions', async () => {
    api.openFile.mockRejectedValueOnce(new Error('No application can open this file'));
    setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    await hover();
    await action('Watch').trigger('click');
    await flushPromises();
    await leave();
    expect(expanded()).toBe(true);
    expect(element('[role="alert"]').text()).toBe('No application can open this file');
    expect(hasAction('Open folder')).toBe(true);
    await action('Copy error').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('No application can open this file'));
  });

  it('uses a localized action error for non-Error rejections', async () => {
    api.showItemInFolder.mockRejectedValueOnce('unavailable');
    setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    await hover();
    await action('Open folder').trigger('click');
    await flushPromises();
    expect(element('[role="alert"]').text()).toBe('The action failed. Please try again.');
  });

  it('keeps a failed export expanded and exposes its full diagnostics for copying', async () => {
    vi.useFakeTimers();
    const report = '=== Beam Export ===\nStatus: failed\n--- Error ---\nDisk full';
    setup({ state: 'failed', error: 'Disk full', report });
    expect(expanded()).toBe(true);
    expect(element('[role="alert"]').text()).toBe('Disk full');
    expect(element('[data-beamy]').attributes('data-phase')).toBe('failed');
    expect(document.body.querySelector('[role="progressbar"]')).toBeNull();
    await hover();
    await leave();
    await vi.advanceTimersByTimeAsync(300);
    expect(expanded()).toBe(true);
    await action('Copy error').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(report));
  });

  it('copies a successful export report without requiring an error', async () => {
    const report = '=== Beam Export ===\nStatus: completed\nOutput File: /exports/done.mp4';
    setup({ state: 'completed', filePath: '/exports/done.mp4', report });
    await hover();
    await action('Copy report').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(report);
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
  });

  it('recovers from a file-action failure when another action succeeds', async () => {
    api.openFile.mockRejectedValueOnce(new Error('Player unavailable'));
    setup({ state: 'completed', filePath: '/exports/finished.mp4' });
    await hover();
    await action('Watch').trigger('click');
    await flushPromises();
    expect(element('[role="alert"]').text()).toBe('Player unavailable');
    await action('Open folder').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(element('[role="status"]').text()).toContain('Video ready');
    expect(document.body.querySelector('[data-beamy]')).toBeNull();
  });

  it('clears a prior file-action failure when a new export is supplied', async () => {
    api.openFile.mockRejectedValueOnce(new Error('Player unavailable'));
    const wrapper = setup({
      state: 'completed',
      filePath: '/exports/finished.mp4',
    });
    await hover();
    await action('Watch').trigger('click');
    await flushPromises();
    expect(element('[role="alert"]').text()).toBe('Player unavailable');
    await wrapper.setProps({
      state: 'working',
      name: 'New export',
      filePath: null,
    });
    await nextTick();
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect(hasAction('Watch')).toBe(false);
    expect(hasAction('Cancel Export')).toBe(true);
  });
});
