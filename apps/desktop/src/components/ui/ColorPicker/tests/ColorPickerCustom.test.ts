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
      props: {
        modelValue: '#123456',
        type: 'standard',
        showAlpha: true,
        alphaValue: 2,
      },
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
      props: {
        modelValue: '#abcdef',
        type: 'standard',
        showAlpha: false,
        alphaValue: 0.75,
      },
    });
    const sv = wrapper.get('.sv-container').element;
    setRect(sv, { left: 0, top: 0, width: 100, height: 100 });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    window.dispatchEvent(new Event('resize'));

    const touchStart = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(touchStart, 'touches', {
      value: [{ clientX: 30, clientY: 70 }],
    });
    await sv.dispatchEvent(touchStart);
    expect(wrapper.get('.custom-color-picker').classes()).toContain('custom-color-picker--dragging');
    const touchMove = new Event('touchmove', {
      bubbles: true,
      cancelable: true,
    });
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
    Object.defineProperty(window, 'EyeDropper', {
      configurable: true,
      value: EyeDropper,
    });
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#000000', type: 'standard' },
    });
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['#fedcba']);

    const failingOpen = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(window, 'EyeDropper', {
      configurable: true,
      value: class {
        open = failingOpen;
      },
    });
    wrapper.unmount();
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#000000', type: 'standard' },
    });
    await wrapper.get('.eyedropper-btn').trigger('click');
    await flushPromises();
    expect(failingOpen).toHaveBeenCalled();
  });
  it('keeps flat pickers header-free and handles programmatic colors and invalid alpha safely', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as never);
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#abcdef', hideHeader: true, alphaValue: 0.5 },
    });
    await flushPromises();
    expect(wrapper.find('.picker-top-bar').exists()).toBe(false);
    await wrapper.setProps({ modelValue: '#ABCDEF', alphaValue: NaN });
    await wrapper.setProps({ modelValue: '' });
    await wrapper.setProps({ modelValue: '#aabbcc', alphaValue: -0.5 });
    expect(wrapper.get('input').element.value).toBe('#AABBCC');
    expect(canvasContext.restore).toHaveBeenCalled();
  });
  it('supports touch hue-ring and triangle selection, empty touches and cancellation', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as never);
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#abcdef', hideHeader: true },
    });
    const area = wrapper.get('.triangle-picker-container').element;
    setRect(wrapper.get('.interaction-layer').element, {
      width: 160,
      height: 160,
    });
    const touch = (target: EventTarget, type: string, points: Array<{ clientX: number; clientY: number }>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: points });
      target.dispatchEvent(event);
    };
    touch(area, 'touchstart', []);
    expect(wrapper.emitted('drag-start')).toBeUndefined();
    touch(area, 'touchstart', [{ clientX: 155, clientY: 70 }]);
    touch(window, 'touchmove', [{ clientX: 5, clientY: 70 }]);
    touch(window, 'touchmove', []);
    touch(window, 'touchcancel', []);
    expect(wrapper.emitted('drag-end')).toHaveLength(1);
    touch(area, 'touchstart', [{ clientX: 80, clientY: 80 }]);
    touch(window, 'touchmove', [{ clientX: 138, clientY: 80 }]);
    touch(window, 'touchend', []);
    expect(wrapper.emitted('drag-end')).toHaveLength(2);
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatch(/^#[a-f0-9]{6}$/i);
  });
  it.each(['hue', 'alpha'])('supports touch %s slider dragging and ignores empty/hidden surfaces', async (channel) => {
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#123456', type: 'standard', showAlpha: true },
    });
    const slider = wrapper.get(`.${channel}-slider-vertical`).element;
    setRect(slider, { left: 0, top: 0, width: 20, height: 100 });
    const touch = (target: EventTarget, type: string, y: number | null) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: y === null ? [] : [{ clientX: 5, clientY: y }],
      });
      target.dispatchEvent(event);
    };
    touch(slider, 'touchstart', 50);
    touch(window, 'touchmove', 75);
    touch(window, 'touchmove', null);
    touch(window, 'touchend', null);
    const update = channel === 'hue' ? 'update:modelValue' : 'update:alpha';
    expect(wrapper.emitted(update)).toHaveLength(2);
    setRect(slider, { width: 0, height: 0 });
    touch(slider, 'touchstart', 50);
    touch(window, 'touchend', null);
    expect(wrapper.emitted(update)).toHaveLength(2);
  });
  it.each(['hue', 'alpha'])('updates %s through mouse movement after the initial press', async (channel) => {
    wrapper = mount(ColorPickerCustom, {
      props: { modelValue: '#123456', type: 'standard', showAlpha: true },
    });
    const slider = wrapper.get(`.${channel}-slider-vertical`);
    setRect(slider.element, { left: 0, top: 0, width: 20, height: 100 });
    await slider.trigger('mousedown', { clientY: 20 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 80 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    const update = channel === 'hue' ? 'update:modelValue' : 'update:alpha';
    expect(wrapper.emitted(update)).toHaveLength(2);
  });
  it('edits all RGB channels with clamped values and ignores zero-size triangle presses', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    wrapper = mount(ColorPickerCustom, { props: { modelValue: '#123456' } });
    await wrapper.get('.triangle-picker-container').trigger('mousedown', { clientX: 0, clientY: 0 });
    expect(wrapper.emitted('drag-start')).toBeUndefined();
    await wrapper.get('.mode-switch-btn').trigger('click');
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('0');
    await inputs[1].setValue('255');
    await inputs[2].setValue('255');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    await wrapper.setProps({ type: 'standard' });
    await wrapper.get('.sv-container').trigger('mousedown');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    window.dispatchEvent(new MouseEvent('mouseup'));
  });
});
