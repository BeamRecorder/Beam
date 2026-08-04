import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WindowSelect from './WindowSelect.vue';

const options = [
  { id: 'window-1', name: 'Editor', thumbnail: '/window.png', appIcon: '/icon.png' },
  { id: 'window-2', name: 'Browser', thumbnail: '/browser.png', appIcon: null },
];

describe('WindowSelect', () => {
  it('renders the selected window and emits a new selection', async () => {
    const wrapper = mount(WindowSelect, { attachTo: document.body, props: { modelValue: 'window-1', options } });
    expect(wrapper.get('.trigger-thumbnail-img').attributes('src')).toBe('/window.png');
    expect(wrapper.find('.trigger-app-icon').exists()).toBe(true);
    await wrapper.get('.select-trigger').trigger('click');
    expect(document.body.querySelectorAll('.select-option')).toHaveLength(2);
    const second = document.body.querySelectorAll<HTMLElement>('.select-option')[1];
    second.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['window-2']]);
  });

  it('shows the empty state and honors disabled triggers', async () => {
    const wrapper = mount(WindowSelect, {
      props: { modelValue: null, options: [], disabled: true, placeholder: 'No window' },
    });
    expect(wrapper.get('.select-label').text()).toBe('No window');
    await wrapper.get('.select-trigger').trigger('click');
    expect(wrapper.find('.select-trigger').classes()).not.toContain('is-open');

    await wrapper.setProps({ disabled: false });
    await wrapper.get('.select-trigger').trigger('click');
    expect(document.body.querySelector('.options-empty')?.textContent).toContain('No windows detected');
    wrapper.unmount();
  });

  it('sizes long labels and scrolls overflowing options in both directions', async () => {
    vi.useFakeTimers();
    let invokeCallback = true;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      if (invokeCallback) {
        invokeCallback = false;
        callback(100);
      }
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const longName = 'A window name that is definitely longer than twenty eight characters';
    const wrapper = mount(WindowSelect, {
      attachTo: document.body,
      props: { modelValue: 'long', options: [{ id: 'long', name: longName, thumbnail: '/long.png' }], direction: 'up' },
    });
    expect((wrapper.get('.select-label').element as HTMLElement).style.fontSize).toBe('0.75rem');
    await wrapper.get('.select-trigger').trigger('click');
    const option = document.body.querySelector<HTMLElement>('.select-option')!;
    const label = option.querySelector<HTMLElement>('.option-label')!;
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 240 });
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 80 });
    invokeCallback = true;
    option.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(option.classList).toContain('has-overflow');
    expect(label.style.transform).toContain('translateX');
    option.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(label.style.transform).toBe('');

    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 80 });
    option.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    expect(option.classList).not.toContain('has-overflow');
    wrapper.unmount();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
