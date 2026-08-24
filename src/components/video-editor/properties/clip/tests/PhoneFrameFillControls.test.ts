import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PhoneFrameFillControls from '../PhoneFrameFillControls.vue';
import { DEFAULT_PHONE_FRAME_GRADIENT } from '~/media/shared/color-fill-types';

const ColorPicker = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="color-stub" @click="$emit(\'update:modelValue\', \'#123456\')">color</button>',
};
const BackgroundPresetComposer = {
  props: ['gradient'],
  emits: ['update-gradient'],
  template:
    "<button class=\"gradient-stub\" @click=\"$emit('update-gradient', { type: 'radial', angle: 45, stops: [{ id: 'start', position: 0, color: '#111111', alpha: 1 }, { id: 'end', position: 1, color: '#eeeeee', alpha: 1 }] })\">gradient</button>",
};
const BigSlider = {
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template:
    '<button class="continuity-slider" :data-label="label" @click="$emit(\'update:modelValue\', modelValue === 12 ? 18 : 80)">slider</button>',
};
const Button = { template: '<button class="mode-button"><slot /></button>' };
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };
const Popover = {
  data: () => ({ open: false }),
  methods: {
    close(this: { open: boolean }) {
      this.open = false;
    },
  },
  template:
    '<div><div class="popover-trigger" @click="open = !open"><slot name="trigger" /></div><slot v-if="open" :close="close" /></div>',
};

const global = { stubs: { ColorPicker, BackgroundPresetComposer, BigSlider, Button, ButtonGroup, Popover } };

describe('PhoneFrameFillControls', () => {
  it('emits color, gradient, and adaptive fill selections', async () => {
    const wrapper = mount(PhoneFrameFillControls, {
      props: { modelValue: { kind: 'color', color: '#000000' } },
      global,
    });

    const modeButton = (index: number) => wrapper.findAll('.mode-button')[index]!;

    await wrapper.get('.color-stub').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([{ kind: 'color', color: '#123456' }]);

    await modeButton(1).trigger('click');
    const gradientEvent = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
    expect(gradientEvent).toEqual({
      kind: 'gradient',
      gradient: DEFAULT_PHONE_FRAME_GRADIENT,
    });

    await wrapper.setProps({ modelValue: { kind: 'gradient', gradient: DEFAULT_PHONE_FRAME_GRADIENT } });
    expect(wrapper.find('.gradient-stub').exists()).toBe(false);
    await wrapper.get('.gradient-editor-trigger').trigger('click');
    expect(wrapper.find('.gradient-stub').exists()).toBe(true);
    await wrapper.get('.gradient-stub').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([
      {
        kind: 'gradient',
        gradient: {
          type: 'radial',
          angle: 45,
          stops: [
            { id: 'start', position: 0, color: '#111111', alpha: 1 },
            { id: 'end', position: 1, color: '#eeeeee', alpha: 1 },
          ],
        },
      },
    ]);

    await modeButton(2).trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([{ kind: 'adaptive' }]);
  });

  it('selects continuity as the fourth mode and emits blur and brightness updates', async () => {
    const wrapper = mount(PhoneFrameFillControls, {
      props: { modelValue: { kind: 'color', color: '#000000' } },
      global,
    });

    const modeButtons = wrapper.findAll('.mode-button');
    expect(modeButtons).toHaveLength(4);

    await modeButtons[3]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([expect.objectContaining({ kind: 'continuity' })]);

    await wrapper.setProps({ modelValue: { kind: 'continuity', blur: 12, brightness: 40 } });
    const sliders = wrapper.findAll('.continuity-slider');
    expect(sliders).toHaveLength(2);

    await sliders[0]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([{ kind: 'continuity', blur: 18, brightness: 40 }]);

    await sliders[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual([{ kind: 'continuity', blur: 12, brightness: 80 }]);
  });
});
