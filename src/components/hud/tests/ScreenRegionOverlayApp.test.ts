import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({
  capture: {
    onScreenRegionConfigure: vi.fn(),
    confirmScreenRegion: vi.fn(),
    cancelScreenRegion: vi.fn(),
    getPreferences: vi.fn().mockResolvedValue({ extras: {} }),
    updatePreferences: vi.fn().mockResolvedValue({ extras: {} }),
  },
}));
vi.mock('../../../api/capture', () => ({ capture }));
vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: () => ({ t: (key: string) => key }),
}));

import ScreenRegionOverlayApp from '../region/ScreenRegionOverlayApp.vue';

const Button = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const Select = {
  props: ['modelValue', 'options', 'placeholder'],
  emits: ['update:modelValue'],
  template: `
    <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
  `,
};

describe('ScreenRegionOverlayApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.getPreferences.mockResolvedValue({ extras: {} });
    capture.updatePreferences.mockResolvedValue({ extras: {} });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
  });

  it('draws a selected region, shows its dimensions and confirms it', async () => {
    let configure!: (value: {
      mode: 'select';
      bounds: { width: number; height: number };
      region?: { x: number; y: number; width: number; height: number };
    }) => void;
    const unsubscribe = vi.fn();
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return unsubscribe;
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 1000, height: 500 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.region-empty-backdrop').exists()).toBe(false);
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 100%');
    expect(wrapper.get('.region-frame').attributes('style')).toContain('height: 100%');
    const main = wrapper.get('.region-overlay');
    const setPointerCapture = vi.fn();
    Object.defineProperty(main.element, 'setPointerCapture', { value: setPointerCapture });
    await main.trigger('pointerdown', { clientX: 100, clientY: 100, pointerId: 7 });
    await main.trigger('pointermove', { clientX: 500, clientY: 400, pointerId: 7 });
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 40%');
    expect(wrapper.get('.region-size').text()).toBe('400 × 300');
    await main.trigger('pointerup');
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    await wrapper.findAll('.region-actions button')[2].trigger('click');
    expect(capture.confirmScreenRegion).toHaveBeenCalledWith(expect.objectContaining({ x: 0.1, y: 0.2, width: 0.4 }));
    expect(capture.confirmScreenRegion.mock.calls[0][0].height).toBeCloseTo(0.6);
    wrapper.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('moves and resizes an existing region while clamping to the viewport', async () => {
    let configure!: (value: {
      mode: 'select';
      bounds: { width: number; height: number };
      region: { x: number; y: number; width: number; height: number };
    }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({
      mode: 'select',
      bounds: { width: 1000, height: 500 },
      region: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
    });
    await wrapper.vm.$nextTick();
    const main = wrapper.get('.region-overlay');
    Object.defineProperty(main.element, 'setPointerCapture', { value: vi.fn() });
    await wrapper.get('.region-frame').trigger('pointerdown', { clientX: 250, clientY: 150, pointerId: 8 });
    await main.trigger('pointermove', { clientX: 900, clientY: 490, pointerId: 8 });
    expect(wrapper.get('.region-frame').attributes('style')).toContain('left: 70%');
    expect(wrapper.get('.region-frame').attributes('style')).toContain('top: 70%');

    await wrapper.get('.resize-handle.se').trigger('pointerdown', { clientX: 500, clientY: 250, pointerId: 9 });
    await main.trigger('pointermove', { clientX: 1200, clientY: 700, pointerId: 9 });
    expect(wrapper.get('.region-frame').attributes('style')).toMatch(/width: 30/);
    await main.trigger('pointercancel');
    await wrapper.findAll('.region-actions button')[0].trigger('click');
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 100%');
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: { screenRegionPreset: null },
    });
  });

  it('cancels selection and ignores pointer input outside select mode', async () => {
    let configure!: (value: { mode: 'select' | 'record'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'record', bounds: { width: 100, height: 100 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.region-toolbar').exists()).toBe(false);
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 100%');
    await wrapper.get('.region-overlay').trigger('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 });
    await wrapper.get('.region-overlay').trigger('pointermove', { clientX: 80, clientY: 80, pointerId: 1 });
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 100%');
    expect(capture.confirmScreenRegion).not.toHaveBeenCalled();

    configure({ mode: 'select', bounds: { width: 100, height: 100 } });
    await wrapper.vm.$nextTick();
    await wrapper.findAll('.region-actions button')[1].trigger('click');
    expect(capture.cancelScreenRegion).toHaveBeenCalledOnce();
  });

  it('renders a non-interactive recording marker without selection controls', async () => {
    let configure!: (value: {
      mode: 'record';
      bounds: { width: number; height: number };
      region: { x: number; y: number; width: number; height: number };
    }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({
      mode: 'record',
      bounds: { width: 1920, height: 1080 },
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    });
    await wrapper.vm.$nextTick();

    const overlay = wrapper.get('.region-overlay');
    expect(overlay.classes()).toContain('recording');
    expect(overlay.classes()).not.toContain('selecting');
    const frame = wrapper.get('.region-frame');
    expect(frame.classes()).toContain('recording');
    expect(frame.classes()).not.toContain('selecting');
    expect(wrapper.find('.region-toolbar').exists()).toBe(false);
    expect(wrapper.findAll('.resize-handle')).toHaveLength(0);
  });

  it('uses crosshair and selection controls only in select mode', async () => {
    let configure!: (value: {
      mode: 'select' | 'record';
      bounds: { width: number; height: number };
      region: { x: number; y: number; width: number; height: number };
    }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    configure({ mode: 'select', bounds: { width: 1920, height: 1080 }, region });
    await wrapper.vm.$nextTick();

    const overlay = wrapper.get('.region-overlay');
    expect(overlay.classes()).toContain('selecting');
    expect(overlay.classes()).not.toContain('recording');
    expect(wrapper.get('.region-frame').classes()).toContain('selecting');
    expect(wrapper.find('.region-toolbar').exists()).toBe(true);

    configure({ mode: 'record', bounds: { width: 1920, height: 1080 }, region });
    await wrapper.vm.$nextTick();
    expect(overlay.classes()).toContain('recording');
    expect(overlay.classes()).not.toContain('selecting');
    expect(wrapper.get('.region-frame').classes()).toContain('recording');
    expect(wrapper.get('.region-frame').classes()).not.toContain('selecting');
    expect(wrapper.find('.region-toolbar').exists()).toBe(false);
  });

  it('applies a selected preset and persists it to preferences', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 2000, height: 1000 } });
    await wrapper.vm.$nextTick();

    const select = wrapper.getComponent(Select);
    expect(select.props('options')).toHaveLength(6);
    expect(select.props('options').map((o: { value: string }) => o.value)).toEqual([
      '640x480',
      '800x600',
      '1024x768',
      '1366x768',
      '1440x990',
      '1920x1080',
    ]);

    await select.vm.$emit('update:modelValue', '1024x768');
    await wrapper.vm.$nextTick();

    // 1024 / 2000 = 0.512 (51.2%), 768 / 1000 = 0.768 (76.8%)
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 51.2%');
    expect(wrapper.get('.region-frame').attributes('style')).toContain('height: 76.8%');
    expect(capture.updatePreferences).toHaveBeenCalledWith({
      extras: { screenRegionPreset: '1024x768' },
    });
  });

  it('loads saved preset from preferences when mounted', async () => {
    capture.getPreferences.mockResolvedValue({
      extras: { screenRegionPreset: '800x600' },
    });

    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });

    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 1600, height: 1200 } });
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    // 800 / 1600 = 50%, 600 / 1200 = 50%
    expect(wrapper.get('.region-frame').attributes('style')).toContain('width: 50%');
    expect(wrapper.get('.region-frame').attributes('style')).toContain('height: 50%');
  });

  it('confirms a full-screen selection with Enter and cancels with Escape', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 2560, height: 1440 } });
    await wrapper.vm.$nextTick();

    const overlay = wrapper.get('.region-overlay');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    overlay.element.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(capture.confirmScreenRegion).toHaveBeenCalledWith({ x: 0, y: 0, width: 1, height: 1 });

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    overlay.element.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(capture.cancelScreenRegion).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('does not consume selection shortcuts for the non-interactive recording marker', async () => {
    let configure!: (value: {
      mode: 'record';
      bounds: { width: number; height: number };
      region: { x: number; y: number; width: number; height: number };
    }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({
      mode: 'record',
      bounds: { width: 1920, height: 1080 },
      region: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    });
    await wrapper.vm.$nextTick();

    const overlay = wrapper.get('.region-overlay');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    overlay.element.dispatchEvent(enter);
    overlay.element.dispatchEvent(escape);

    expect(enter.defaultPrevented).toBe(false);
    expect(escape.defaultPrevented).toBe(false);
    expect(capture.confirmScreenRegion).not.toHaveBeenCalled();
    expect(capture.cancelScreenRegion).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('leaves Enter and Escape available to focused toolbar controls', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 2560, height: 1440 } });
    await wrapper.vm.$nextTick();

    const confirmButton = wrapper.findAll('.region-actions button')[2];
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    confirmButton.element.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(capture.confirmScreenRegion).not.toHaveBeenCalled();

    const preset = wrapper.get('.region-preset-picker select');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    preset.element.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(capture.cancelScreenRegion).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('removes the global keyboard listener when the overlay is unmounted', async () => {
    let configure!: (value: { mode: 'select'; bounds: { width: number; height: number } }) => void;
    capture.onScreenRegionConfigure.mockImplementation((next: typeof configure) => {
      configure = next;
      return vi.fn();
    });
    const remove = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount(ScreenRegionOverlayApp, { global: { stubs: { Button, Select } } });
    configure({ mode: 'select', bounds: { width: 2560, height: 1440 } });
    await wrapper.vm.$nextTick();
    wrapper.unmount();

    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    remove.mockRestore();
  });
});
