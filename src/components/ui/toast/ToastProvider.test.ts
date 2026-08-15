import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from './toastStore';
import ToastProvider from './ToastProvider.vue';

describe('ToastProvider', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.unstubAllGlobals());

  it('renders icons for each type and handles action and dismissal', async () => {
    const store = useToastStore();
    const onClick = vi.fn();
    store.add('Success message', 'success', 0);
    store.add('Error message', 'error', 0);
    store.add('Warning message', 'warning', 0);
    store.add('Action message', 'info', 0, { label: 'Retry', onClick });
    const wrapper = mount(ToastProvider);
    expect(wrapper.findAll('.toast-item')).toHaveLength(4);
    expect(wrapper.find('.toast-icon.success').exists()).toBe(true);
    expect(wrapper.find('.toast-icon.error').exists()).toBe(true);
    expect(wrapper.find('.toast-item.warning .toast-icon.warning').exists()).toBe(true);
    expect(wrapper.find('.toast-icon.info').exists()).toBe(true);
    await wrapper.find('.toast-action-btn').trigger('click');
    expect(onClick).toHaveBeenCalledOnce();
    expect(store.toasts).toHaveLength(3);
    await wrapper.find('.toast-close').trigger('click');
    expect(store.toasts).toHaveLength(2);
  });

  it('renders a copy action with the Lucide Copy icon and an accessible label', () => {
    const store = useToastStore();
    store.error('Playback failed', 0, { label: 'Copy error', copyText: 'diagnostic details' });
    const wrapper = mount(ToastProvider);
    const action = wrapper.get('.toast-action-btn');

    expect(action.attributes('aria-label')).toBe('Copy error');
    expect(action.find('svg').classes()).toEqual(expect.arrayContaining(['lucide-copy']));
  });

  it('keeps an action toast visible when its asynchronous action fails', async () => {
    const store = useToastStore();
    const onClick = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    store.error('Playback failed', 0, { label: 'Copy error', onClick });
    const wrapper = mount(ToastProvider);

    await wrapper.get('.toast-action-btn').trigger('click');
    await vi.waitFor(() => expect(onClick).toHaveBeenCalledOnce());

    expect(store.toasts).toHaveLength(1);
    expect(wrapper.find('.toast-item').exists()).toBe(true);
  });

  it('shows action details and a Check icon after a successful non-dismissing action', async () => {
    const store = useToastStore();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    store.error('Playback failed', 0, {
      label: 'Copy error',
      detail: 'Copied to clipboard',
      dismissOnSuccess: false,
      copyText: 'diagnostic details',
    });
    const wrapper = mount(ToastProvider);

    expect(wrapper.text()).toContain('Copied to clipboard');
    expect(wrapper.get('.toast-detail').classes()).toContain('toast-detail');
    await wrapper.get('.toast-action-btn').trigger('click');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    expect(store.toasts).toHaveLength(1);
    expect(wrapper.get('.toast-action-btn').find('svg').classes()).toEqual(expect.arrayContaining(['lucide-check']));
  });
});
