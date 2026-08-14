import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapturePreview, CaptureSource } from '../../api/types/capture-api';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'screenOption') return `Screen ${String(params?.index ?? '')}`;
      return (
        {
          selectScreen: 'Select a screen',
          selectWindow: 'Select a window',
          noScreensDetected: 'No screens detected',
          noWindowsDetected: 'No windows detected',
        }[key] ?? key
      );
    },
  }),
}));

import SourceSelect from './SourceSelect.vue';

const mountSourceSelect = (props: {
  modelValue: string | null;
  kind: 'screen' | 'window';
  sources?: CaptureSource[];
  previews?: CapturePreview[];
  loading?: boolean;
  disabled?: boolean;
}) =>
  mount(SourceSelect, {
    attachTo: document.body,
    props,
  });

const screenSource = (id: string, displayId: string, isDefault = false): CaptureSource => ({
  id,
  kind: 'display',
  label: displayId,
  isDefault,
  displayId,
});

const screenPreview = (id: string, displayId: string, thumbnail: string): CapturePreview => ({
  id,
  name: displayId,
  thumbnail,
  appIcon: null,
  displayId,
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SourceSelect', () => {
  it('matches screen thumbnails by exact display id and emits the native screen id', async () => {
    const nativeFirstId = 'sck:display:123';
    const nativeSecondId = 'sck:display:456';
    const wrapper = mountSourceSelect({
      modelValue: nativeFirstId,
      kind: 'screen',
      sources: [screenSource(nativeFirstId, '123', true), screenSource(nativeSecondId, '456')],
      // Deliberately reverse the preview order: source order is not an identity mapping.
      previews: [screenPreview('screen:456', '456', 'screen-two'), screenPreview('screen:123', '123', 'screen-one')],
    });

    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('screen-one');
    await wrapper.get('.select-trigger').trigger('click');

    const options = document.body.querySelectorAll<HTMLElement>('.select-option');
    expect(options).toHaveLength(2);
    expect(options[0].querySelector('.thumbnail-img')?.getAttribute('src')).toBe('screen-one');
    expect(options[1].querySelector('.thumbnail-img')?.getAttribute('src')).toBe('screen-two');

    options[1].click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[nativeSecondId]]);
    wrapper.unmount();
  });

  it('uses the one-screen Windows fallback while preserving the native monitor id', async () => {
    const nativeId = String.raw`wgc:monitor:\\.\DISPLAY1`;
    const wrapper = mountSourceSelect({
      modelValue: nativeId,
      kind: 'screen',
      sources: [screenSource(nativeId, String.raw`\\.\DISPLAY1`, true)],
      // Electron's numeric display id does not equal the native Windows device path.
      previews: [screenPreview('screen:123456', '123456', 'windows-screen')],
    });

    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('windows-screen');
    await wrapper.get('.select-trigger').trigger('click');
    const option = document.body.querySelector<HTMLElement>('.select-option');
    expect(option?.querySelector('.thumbnail-img')?.getAttribute('src')).toBe('windows-screen');

    option?.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[nativeId]]);
    wrapper.unmount();
  });

  it('renders window thumbnails and app icons and emits the selected window preview id', async () => {
    const wrapper = mountSourceSelect({
      modelValue: 'window:editor',
      kind: 'window',
      previews: [
        { id: 'window:editor', name: 'Editor', thumbnail: 'editor-window', appIcon: 'editor-icon' },
        { id: 'window:browser', name: 'Browser', thumbnail: 'browser-window', appIcon: null },
      ],
    });

    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('editor-window');
    expect(wrapper.get('.trigger-app-icon').attributes('src')).toBe('editor-icon');
    await wrapper.get('.select-trigger').trigger('click');

    const options = document.body.querySelectorAll<HTMLElement>('.select-option');
    expect(options[0].querySelector('.thumbnail-img')?.getAttribute('src')).toBe('editor-window');
    expect(options[0].querySelector('.app-icon')?.getAttribute('src')).toBe('editor-icon');
    expect(options[1].querySelector('.thumbnail-img')?.getAttribute('src')).toBe('browser-window');
    options[1].click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['window:browser']]);
    wrapper.unmount();
  });

  it('renders Portal monitor and window choices without Electron previews', async () => {
    const monitor = mountSourceSelect({
      modelValue: 'portal:monitor',
      kind: 'screen',
      sources: [
        {
          id: 'portal:monitor',
          kind: 'display',
          label: 'Choose a screen with the system picker',
          isDefault: true,
          selectionMode: 'portal',
        },
      ],
    });
    expect(monitor.get('.select-label').text()).toBe('Choose a screen with the system picker');
    monitor.unmount();

    const window = mountSourceSelect({
      modelValue: 'portal:window',
      kind: 'window',
      sources: [
        {
          id: 'portal:window',
          kind: 'window',
          label: 'Choose a window with the system picker',
          isDefault: true,
          selectionMode: 'portal',
        },
      ],
      previews: [],
    });
    expect(window.get('.select-label').text()).toBe('Choose a window with the system picker');
    await window.get('.select-trigger').trigger('click');
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(1);
    window.unmount();
  });

  it('shows loading state and an explicit empty state without allowing a fake selection', async () => {
    const loadingWrapper = mountSourceSelect({
      modelValue: 'sck:display:123',
      kind: 'screen',
      sources: [screenSource('sck:display:123', '123', true)],
      previews: [],
      loading: true,
    });
    expect(loadingWrapper.find('.skeleton').exists()).toBe(true);
    expect(loadingWrapper.get('.select-trigger').attributes('disabled')).toBeUndefined();
    await loadingWrapper.get('.select-trigger').trigger('click');
    expect(document.body.querySelector('.select-option .skeleton')).not.toBeNull();
    loadingWrapper.unmount();

    const emptyWrapper = mountSourceSelect({ modelValue: null, kind: 'window' });
    expect(emptyWrapper.get('.select-label').text()).toBe('No windows detected');
    await emptyWrapper.get('.select-trigger').trigger('click');
    expect(document.body.querySelector('.options-empty')?.textContent).toBe('No windows detected');
    expect(emptyWrapper.emitted('update:modelValue')).toBeUndefined();
    emptyWrapper.unmount();
  });
});
