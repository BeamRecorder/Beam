import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { DesktopCaptureApi } from '~/api/types/capture-api';
import { i18n, setCurrentLocale } from '~/i18n';
import { SUPPORTED_LOCALES } from '~/i18n/locales';
import ColorPicker from '../ColorPicker.vue';
import ColorPickerCustom from '../ColorPickerCustom.vue';
import Popover from '../../popover/Popover.vue';

enableAutoUnmount(afterEach);
let resolve: (color: string | null) => void;
let reject: (failure: unknown) => void;
const pick = vi.fn();
const cancel = vi.fn();
const browserOpen = vi.fn();
const picker = () =>
  mount(ColorPickerCustom, {
    props: { type: 'standard', modelValue: '#123456' },
  });

beforeEach(() => {
  pick.mockImplementation(
    () =>
      new Promise<string | null>((yes, no) => {
        resolve = yes;
        reject = no;
      }),
  );
  cancel.mockResolvedValue(undefined);
  window.capture = {
    platform: 'linux',
    pickScreenColor: pick,
    cancelScreenColorPicker: cancel,
  } as unknown as DesktopCaptureApi;
  Object.defineProperty(window, 'EyeDropper', {
    configurable: true,
    value: class {
      open = browserOpen;
    },
  });
});

afterEach(() => {
  delete window.capture;
  delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('screen color selection', () => {
  it('uses the Linux portal even when Chromium exposes EyeDropper and prevents double launches', async () => {
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    expect(wrapper.get('button.eyedropper-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button.eyedropper-btn').attributes('aria-busy')).toBe('true');
    await wrapper.get('.eyedropper-btn').trigger('click');
    expect(pick).toHaveBeenCalledTimes(1);
    expect(browserOpen).not.toHaveBeenCalled();
    resolve('#fedcba');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['#fedcba']]);
    expect(wrapper.get('button.eyedropper-btn').attributes('disabled')).toBeUndefined();
  });

  it('offers native selection without the Chromium API and keeps cancellation quiet', async () => {
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    resolve(null);
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('reports failures and clears them when retrying', async () => {
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    reject(new Error('PickColor is unavailable'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Unable to pick a screen color. Please try again.');
    expect(wrapper.get('[role="alert"]').attributes('title')).toBe('PickColor is unavailable');
    await wrapper.get('.eyedropper-btn').trigger('click');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    resolve('#123456');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['#123456']]);
  });

  it('rejects invalid results and non-Error failures without changing the color', async () => {
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    resolve('bad');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').attributes('title')).toContain('invalid color');
    await wrapper.get('.eyedropper-btn').trigger('click');
    reject('portal disconnected');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').attributes('title')).toBe('portal disconnected');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('cancels native selection on disposal and discards late results', async () => {
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    wrapper.unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    resolve('#ffffff');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('records cancellation cleanup failures and ignores late rejection after disposal', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    cancel.mockRejectedValueOnce(new Error('shutdown IPC rejected'));
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    wrapper.unmount();
    reject(new Error('worker terminated'));
    await flushPromises();
    expect(log).toHaveBeenCalledWith('Color picker cancellation failed', expect.any(Error));
    log.mockRestore();
  });

  it('uses a cancellable browser picker outside Linux', async () => {
    window.capture = { platform: 'win32' } as DesktopCaptureApi;
    browserOpen.mockResolvedValueOnce({ sRGBHex: '#ffffff' });
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toEqual([['#ffffff']]);
    expect(browserOpen.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
    expect(pick).not.toHaveBeenCalled();
  });

  it('keeps browser cancellation quiet and aborts a pending picker on disposal', async () => {
    delete window.capture;
    browserOpen.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    browserOpen.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_yes, no) => {
          signal.addEventListener('abort', () => no(new DOMException('cancelled', 'AbortError')));
        }),
    );
    await wrapper.get('.eyedropper-btn').trigger('click');
    const signal = browserOpen.mock.calls.at(-1)![0].signal as AbortSignal;
    wrapper.unmount();
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('hides unavailable browser pickers and handles removal of their API before activation', async () => {
    delete window.capture;
    const wrapper = picker();
    delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').attributes('title')).toContain('unavailable');
    const unavailable = picker();
    expect(unavailable.find('.eyedropper-btn').exists()).toBe(false);
  });

  it('holds both picker and parent popovers during native focus loss, then restores dismissal', async () => {
    const Host = defineComponent({
      setup: () => () =>
        h(
          Popover,
          {},
          {
            trigger: () => h('button', { class: 'open-parent' }, 'Open'),
            default: () => h(ColorPicker, { modelValue: '#123456' }),
          },
        ),
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await wrapper.get('.open-parent').trigger('click');
    const color = wrapper.getComponent(ColorPicker);
    await color.get('.popover-trigger').trigger('click');
    await flushPromises();
    await color.getComponent(ColorPickerCustom).get('.eyedropper-btn').trigger('click');
    window.dispatchEvent(new Event('blur'));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(document.querySelectorAll('.popover-content')).toHaveLength(2);
    expect(cancel).not.toHaveBeenCalled();
    resolve('#abcdef');
    await flushPromises();
    expect(color.emitted('update:modelValue')).toEqual([['#abcdef']]);
    window.dispatchEvent(new Event('blur'));
    await flushPromises();
    expect(document.querySelectorAll('.popover-content')).toHaveLength(0);
  });

  it.each(SUPPORTED_LOCALES)('translates picker failure feedback in %s', async (locale) => {
    await setCurrentLocale(locale);
    const wrapper = picker();
    await wrapper.get('.eyedropper-btn').trigger('click');
    reject(new Error('portal unavailable'));
    await flushPromises();
    expect(i18n.global.te('ColorPicker.eyedropperError', locale)).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toBe(i18n.global.t('ColorPicker.eyedropperError'));
  });
});
