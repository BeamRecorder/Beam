import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColorPickerCustom from '../ColorPickerCustom.vue';

const canvasContext = {
  clearRect: vi.fn(),
  save: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  fillRect: vi.fn(),
  restore: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
};

let wrapper: VueWrapper | undefined;

const setRect = (element: Element, rect: Partial<DOMRect>) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
};

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  delete (window as Window & { EyeDropper?: unknown }).EyeDropper;
  vi.restoreAllMocks();
});

describe('ColorPickerCustom', () => {
  it('renders the triangle picker, draws its canvas, and updates hue/value through dragging', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as never);
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#336699', type: 'triangle', alphaValue: 0.4 },
    });
    const interactionLayer = wrapper.get('.interaction-layer').element;
    setRect(interactionLayer, { left: 0, top: 0, width: 160, height: 160 });
    await flushPromises();

    expect(canvasContext.clearRect).toHaveBeenCalled();
    expect(canvasContext.createLinearGradient).toHaveBeenCalledTimes(2);
    await wrapper.get('.triangle-picker-container').trigger('mousedown', {
      clientX: 125,
      clientY: 80,
      button: 0,
    });
    expect(wrapper.emitted('drag-start')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(wrapper.emitted('drag-end')).toHaveLength(1);
    expect(wrapper.find('.custom-color-picker--dragging').exists()).toBe(false);
  });

  it('supports standard SV, hue, alpha and RGB controls with clamped values', async () => {
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#123456', type: 'standard', showAlpha: true, alphaValue: 2 },
    });
    const sv = wrapper.get('.sv-container').element;
    const hue = wrapper.get('.hue-slider-vertical').element;
    const alpha = wrapper.get('.alpha-slider-vertical').element;
    setRect(sv, { left: 10, top: 20, width: 200, height: 100 });
    setRect(hue, { left: 0, top: 10, width: 20, height: 200 });
    setRect(alpha, { left: 0, top: 10, width: 20, height: 200 });

    await wrapper.get('.sv-container').trigger('mousedown', { clientX: 300, clientY: -10 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 120 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.get('.hue-slider-vertical').trigger('mousedown', { clientY: 210 });
    window.dispatchEvent(new MouseEvent('mouseup'));
    await wrapper.get('.alpha-slider-vertical').trigger('mousedown', { clientY: 110 });
    expect(wrapper.emitted('update:alpha')?.at(-1)?.[0]).toBe(0.5);
    window.dispatchEvent(new MouseEvent('mouseup'));

    await wrapper.get('.mode-switch-btn').trigger('click');
    expect(wrapper.findAll('.channel-input-wrapper')).toHaveLength(3);
    const redInput = wrapper.findAll('input[type="number"]')[0];
    await redInput.setValue('300');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(wrapper.get('.custom-color-picker').classes()).toContain('custom-color-picker--standard');
  });

  it('handles touch interactions, mobile dragging state, alpha changes, close, and hex input', async () => {
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#abcdef', type: 'standard', showAlpha: false, alphaValue: 0.75 },
    });
    const sv = wrapper.get('.sv-container').element;
    setRect(sv, { left: 0, top: 0, width: 100, height: 100 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    window.dispatchEvent(new Event('resize'));

    const touchStart = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, 'touches', {
      value: [{ clientX: 30, clientY: 70 }],
    });
    await sv.dispatchEvent(touchStart);
    expect(wrapper.get('.custom-color-picker').classes()).toContain('custom-color-picker--dragging');
    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(touchMove, 'touches', {
      value: [{ clientX: 80, clientY: 20 }],
    });
    window.dispatchEvent(touchMove);
    window.dispatchEvent(new Event('touchend'));
    expect(wrapper.emitted('drag-end')).toHaveLength(1);

    const hexInput = wrapper.get('.hex-wrapper input');
    await hexInput.setValue('#010203');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['#010203']);
    await wrapper.get('.picker-top-bar .btn').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('uses the optional eye dropper and ignores rejected or unavailable pickers', async () => {
    class EyeDropper {
      open = vi.fn().mockResolvedValue({ sRGBHex: '#fedcba' });
    }
    Object.defineProperty(window, 'EyeDropper', { configurable: true, value: EyeDropper });
    wrapper = mount(ColorPickerCustom, { props: { modelValue: '#000000', type: 'standard' } });
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['#fedcba']);

    const failingOpen = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(window, 'EyeDropper', {
      configurable: true,
      value: class { open = failingOpen; },
    });
    wrapper.unmount();
    wrapper = mount(ColorPickerCustom, { props: { modelValue: '#000000', type: 'standard' } });
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(failingOpen).toHaveBeenCalled();
  });
});
