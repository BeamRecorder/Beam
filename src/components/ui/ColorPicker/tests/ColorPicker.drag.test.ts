import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Popover from '../../popover/Popover.vue';
import ColorPicker from '../ColorPicker.vue';
import ColorPickerCustom from '../ColorPickerCustom.vue';

enableAutoUnmount(afterEach);
afterEach(() => vi.restoreAllMocks());

const setPickerBounds = (element: Element) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 160, 160));
};
const dispatchMouse = (target: EventTarget, type: string, x: number, y: number) => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
};

describe('color picker drags outside popovers', () => {
  it.each(['sv-container', 'hue-slider-vertical', 'alpha-slider-vertical'])(
    'keeps the picker open after dragging %s outside, then dismisses on a new outside press',
    async (surface) => {
      const wrapper = mount(ColorPicker, {
        attachTo: document.body,
        props: { modelValue: '#123456', showAlpha: true },
      });
      await wrapper.get('.popover-trigger').trigger('click');
      await flushPromises();
      const picker = wrapper.getComponent(ColorPickerCustom);
      const pad = picker.get(`.${surface}`).element;
      setPickerBounds(pad);
      dispatchMouse(pad, 'pointerdown', 80, 90);
      dispatchMouse(pad, 'mousedown', 80, 90);
      dispatchMouse(document.body, 'mousemove', 360, 300);
      expect(document.querySelector('.popover-picker-content')).not.toBeNull();
      dispatchMouse(document.body, 'pointerup', 360, 300);
      dispatchMouse(document.body, 'mouseup', 360, 300);
      dispatchMouse(document.body, 'click', 360, 300);
      await flushPromises();
      expect(picker.emitted('drag-start')).toHaveLength(1);
      expect(picker.emitted('drag-end')).toHaveLength(1);
      expect(document.querySelector('.popover-picker-content')).not.toBeNull();
      const update = surface === 'alpha-slider-vertical' ? 'update:alpha' : 'update:modelValue';
      expect(wrapper.emitted(update)).toHaveLength(2);
      dispatchMouse(document.body, 'mousedown', 400, 350);
      dispatchMouse(document.body, 'mouseup', 400, 350);
      dispatchMouse(document.body, 'click', 400, 350);
      await flushPromises();
      expect(document.querySelector('.popover-picker-content')).toBeNull();
    },
  );

  it('keeps a triangle picker open when its ring drag ends outside', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const wrapper = mount(ColorPicker, {
      attachTo: document.body,
      props: { modelValue: '#123456', type: 'triangle' },
    });
    await wrapper.get('.popover-trigger').trigger('click');
    await flushPromises();
    const picker = wrapper.getComponent(ColorPickerCustom);
    setPickerBounds(picker.get('.interaction-layer').element);
    dispatchMouse(picker.get('.triangle-picker-container').element, 'mousedown', 175, 110);
    dispatchMouse(document.body, 'mousemove', 300, 400);
    dispatchMouse(document.body, 'mouseup', 300, 400);
    dispatchMouse(document.body, 'click', 300, 400);
    await flushPromises();
    expect(picker.emitted('drag-end')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2);
    expect(document.querySelector('.popover-picker-content')).not.toBeNull();
  });

  it('keeps both parent and nested color picker open after releasing a pad drag outside', async () => {
    const wrapper = mount(
      {
        components: { Popover, ColorPicker },
        template: `
        <Popover>
          <template #trigger><button class="open-parent">Open settings</button></template>
          <ColorPicker model-value="#123456" />
        </Popover>
      `,
      },
      { attachTo: document.body },
    );
    await wrapper.get('.open-parent').trigger('click');
    await flushPromises();
    const color = wrapper.getComponent(ColorPicker);
    await color.get('.popover-trigger').trigger('click');
    await flushPromises();
    const picker = wrapper.getComponent(ColorPickerCustom);
    const pad = picker.get('.sv-container').element;
    setPickerBounds(pad);
    dispatchMouse(pad, 'mousedown', 80, 90);
    dispatchMouse(document.body, 'mousemove', 360, 300);
    dispatchMouse(document.body, 'mouseup', 360, 300);
    dispatchMouse(document.body, 'click', 360, 300);
    await flushPromises();
    expect(document.querySelectorAll('.popover-content')).toHaveLength(2);
    expect(picker.emitted('drag-end')).toHaveLength(1);
    dispatchMouse(document.body, 'mousedown', 400, 350);
    dispatchMouse(document.body, 'click', 400, 350);
    await flushPromises();
    expect(document.querySelectorAll('.popover-content')).toHaveLength(0);
  });
});
