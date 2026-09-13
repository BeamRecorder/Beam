import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElementFullscreen } from './useElementFullscreen';

const mountFullscreen = (withTarget = true) => {
  const component = defineComponent({
    setup() {
      const targetRef = ref<HTMLElement | null>(null);
      return { ...useElementFullscreen(() => targetRef.value), targetRef };
    },
    render() {
      return withTarget ? h('div', { ref: 'targetRef' }) : h('span');
    },
  });

  const wrapper = mount(component);
  return { wrapper, target: withTarget ? wrapper.element : null };
};

describe('useElementFullscreen', () => {
  beforeEach(() => {
    document.body.classList.remove('beam-app-fullscreen-active');
  });

  afterEach(() => {
    document.body.classList.remove('beam-app-fullscreen-active');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('toggles the app state and body class without using Electron fullscreen APIs', () => {
    vi.useFakeTimers();
    const requestFullscreen = vi.fn();
    const exitFullscreen = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    const { wrapper, target } = mountFullscreen();

    wrapper.vm.toggleFullscreen();

    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(true);
    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(target.classList.contains('is-app-fullscreen')).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(exitFullscreen).not.toHaveBeenCalled();

    wrapper.vm.toggleFullscreen();

    vi.runAllTimers();

    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(target.classList.contains('is-app-fullscreen')).toBe(false);
  });

  it('does nothing and warns when the fullscreen target is unavailable', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { wrapper } = mountFullscreen(false);

    wrapper.vm.toggleFullscreen();

    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(warning).toHaveBeenCalledWith('[Beam fullscreen] Preview target is unavailable.');
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
  });

  it('exits the in-app fullscreen mode with Escape', () => {
    vi.useFakeTimers();
    const { wrapper } = mountFullscreen();
    wrapper.vm.toggleFullscreen();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(true);
    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(wrapper.vm.isExiting).toBe(true);

    vi.runAllTimers();

    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(wrapper.vm.isExiting).toBe(false);
  });

  it('keeps the fullscreen state during the exit animation and clears it after the timer', () => {
    vi.useFakeTimers();
    const { wrapper } = mountFullscreen();
    wrapper.vm.toggleFullscreen();

    wrapper.vm.toggleFullscreen();

    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(wrapper.vm.isExiting).toBe(true);
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(true);

    vi.runAllTimers();

    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(wrapper.vm.isExiting).toBe(false);
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
  });

  it('ignores re-entry and repeated toggles while the exit animation is running', () => {
    vi.useFakeTimers();
    const { wrapper } = mountFullscreen();
    wrapper.vm.toggleFullscreen();
    wrapper.vm.toggleFullscreen();

    wrapper.vm.toggleFullscreen();
    wrapper.vm.toggleFullscreen();

    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(wrapper.vm.isExiting).toBe(true);

    vi.runAllTimers();

    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(wrapper.vm.isExiting).toBe(false);
  });

  it('clears a pending exit timer when the fullscreen controller is unmounted', () => {
    vi.useFakeTimers();
    const { wrapper } = mountFullscreen();
    wrapper.vm.toggleFullscreen();
    wrapper.vm.toggleFullscreen();

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(wrapper.vm.isFullscreen).toBe(false);
    expect(wrapper.vm.isExiting).toBe(false);
    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
  });

  it('keeps fullscreen active when Space is pressed on a focused button', () => {
    const { wrapper, target } = mountFullscreen();
    wrapper.vm.toggleFullscreen();
    document.body.appendChild(target);

    const button = document.createElement('button');
    target.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Space',
      key: ' ',
    });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(button);
    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(target.classList.contains('is-app-fullscreen')).toBe(false);
  });

  it('removes fullscreen classes and keyboard listeners on unmount', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const { wrapper, target } = mountFullscreen();
    wrapper.vm.toggleFullscreen();

    wrapper.unmount();

    expect(document.body.classList.contains('beam-app-fullscreen-active')).toBe(false);
    expect(target.classList.contains('is-app-fullscreen')).toBe(false);
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
  });

  it('toggles synchronously so the app fullscreen state is immediately observable', () => {
    const { wrapper } = mountFullscreen();
    wrapper.vm.toggleFullscreen();

    expect(wrapper.vm.isFullscreen).toBe(true);
    expect(wrapper.vm.isExiting).toBe(false);
  });
});
