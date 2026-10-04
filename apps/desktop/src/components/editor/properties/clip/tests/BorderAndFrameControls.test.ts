import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BigSliderComponent from '~/ui/slider/BigSlider.vue';
import Select from '~/ui/select/Select.vue';
import { DEFAULT_ANIMATED_FRAME } from '@beam/engine/shared/animated-frame-types';
import BorderAndFrameControls from '../BorderAndFrameControls.vue';

const Switch = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="switch-stub" @click="$emit(\'update:modelValue\', !modelValue)">switch</button>',
};
const ColorPicker = {
  emits: ['update:modelValue'],
  template: '<button class="color-stub" @click="$emit(\'update:modelValue\', \'#123456\')">color</button>',
};
const BigSlider = {
  props: ['modelValue', 'formatValue', 'label'],
  emits: ['update:modelValue'],
  template: '<button class="slider-stub" @click="$emit(\'update:modelValue\', 12)">slider</button>',
};
const Input = {
  props: ['modelValue', 'size', 'appearance'],
  emits: ['update:modelValue'],
  template: '<input id="frame-title" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const Gradient = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="gradient-stub">gradient</button>',
};
const Button = { template: '<button class="frame-button"><slot /></button>' };
const ButtonGroup = { template: '<div class="button-group"><slot /></div>' };

const SelectStub = {
  props: ['modelValue', 'options', 'label', 'size', 'appearance', 'optionHeight'],
  emits: ['update:modelValue'],
  template: `<select class="frame-select" :aria-label="label" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option v-for="item in options" :key="item.value" :value="item.value">{{ item.label }}</option></select>`,
};
const global = {
  stubs: {
    Switch,
    Select: SelectStub,
    ColorPicker,
    BigSlider,
    Input,
    Gradient,
    Button,
    ButtonGroup,
  },
};

describe('BorderAndFrameControls', () => {
  it('offers independent Auto, Light and Dark Safari modes without changing the frame color', async () => {
    const wrapper = mount(BorderAndFrameControls, { props: { frame: 'safari', frameColor: '#123456' }, global });
    expect(wrapper.get('[aria-label="Browser appearance"]').text()).toContain('Auto');
    for (const [label, value] of [
      ['Auto', 'auto'],
      ['Light', 'light'],
      ['Dark', 'dark'],
    ]) {
      const button = wrapper.findAll('.frame-button').find((item) => item.text() === label)!;
      await button.trigger('click');
      expect(wrapper.emitted('update')).toContainEqual([{ frameTheme: value }]);
    }
    expect(wrapper.props('frameColor')).toBe('#123456');
    await wrapper.setProps({ frameTheme: 'dark' });
    expect(
      wrapper
        .findAll('.frame-button')
        .find((item) => item.text() === 'Dark')!
        .attributes('aria-pressed'),
    ).toBe('true');
    wrapper.unmount();
  });
  it.each(['windows-95', 'iphone-16-max'] as const)(
    'keeps Safari appearance choices out of the %s controls',
    (frame) => {
      const wrapper = mount(BorderAndFrameControls, { props: { frame }, global });
      expect(wrapper.find('[aria-label="Browser appearance"]').exists()).toBe(false);
      wrapper.unmount();
    },
  );
  it('keeps enabled border and frame controls collapsed until requested without changing their values', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { borderEnabled: true, frame: 'safari', frameTitle: 'Saved title' },
      global,
    });
    for (const trigger of wrapper.findAll('.accordion-trigger')) {
      expect(trigger.attributes('aria-expanded')).toBe('false');
      await trigger.trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');
      await trigger.trigger('click');
    }
    expect(wrapper.get<HTMLInputElement>('#frame-title').element.value).toBe('Saved title');
    expect(wrapper.emitted('update')).toBeUndefined();
    wrapper.unmount();
  });
  it('renders the translated border color label', () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { borderEnabled: true },
      global,
    });
    expect(wrapper.text()).toContain('Border color');
    expect(wrapper.text()).not.toContain('BorderAndFrameControls.borderColor');
    wrapper.unmount();
  });

  it('toggles the border and emits its color and width changes', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { borderEnabled: false },
      global,
    });
    await wrapper.get('.switch-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ borderEnabled: true }]);

    await wrapper.setProps({
      borderEnabled: true,
      borderColor: '#000000',
      borderWidth: 2,
    });
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    await wrapper.get('.color-stub').trigger('click');
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ borderColor: '#123456' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ borderWidth: 12 }]);
  });

  it('remembers the selected model when the frame is toggled off and back on', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: { frame: 'none' },
      global,
    });

    const frameToggle = () => wrapper.findAll('.switch-stub')[1]!;

    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'safari' }]);

    await wrapper.setProps({
      frame: 'safari',
      frameTitle: '',
      frameChromeScale: 1,
    });
    expect(
      wrapper
        .get('select')
        .findAll('option')
        .map((option) => option.text()),
    ).toEqual(['Safari', 'Windows 95', 'Animated border', 'iPhone 16 Pro Max', 'Pixel 9 Pro']);
    await wrapper.get('select').setValue('windows-95');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'windows-95' }]);
    await wrapper.setProps({
      frame: 'windows-95',
      frameShowMenu: true,
      frameShowScrollbars: true,
      frameChromeScale: 1,
    });
    expect(wrapper.find('#frame-title').exists()).toBe(true);
    expect(wrapper.findAll('.color-stub')).toHaveLength(1);
    expect(wrapper.findAll('.switch-stub')).toHaveLength(4);
    await wrapper.get('#frame-title').setValue('Demo');
    await wrapper.findAll('.color-stub')[0]!.trigger('click');
    await wrapper.findAll('.switch-stub')[2]!.trigger('click');
    await wrapper.findAll('.switch-stub')[3]!.trigger('click');
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frameTitle: 'Demo' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameColor: '#123456' }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowMenu: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameShowScrollbars: false }]);
    expect(wrapper.emitted('update')).toContainEqual([{ frameChromeScale: 0.12 }]);

    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'none' }]);
    await wrapper.setProps({ frame: 'none' });
    await frameToggle().trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'windows-95' }]);
  });

  it('selects phone models with their thumbnails and hides desktop chrome controls', async () => {
    const wrapper = mount(BorderAndFrameControls, { props: { frame: 'safari' }, global });
    const model = wrapper.findComponent(Select);
    expect(model.props('options')).toHaveLength(5);
    expect(model.props('options')!.every((option) => option.thumbnail)).toBe(true);
    expect(wrapper.find('#frame-title').exists()).toBe(true);
    await wrapper.get('select').setValue('iphone-16-max');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'iphone-16-max' }]);
    await wrapper.setProps({ frame: 'iphone-16-max' });
    expect(wrapper.find('#frame-title').exists()).toBe(false);
    expect(wrapper.find('.slider-stub').exists()).toBe(false);
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(true);
    expect(wrapper.findAll('.color-stub')).toHaveLength(2);
    await wrapper.get('select').setValue('pixel-9-pro');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'pixel-9-pro' }]);
    wrapper.unmount();
  });

  it('offers five thumbnail presets without window or phone controls for animated borders', async () => {
    const wrapper = mount(BorderAndFrameControls, { props: { frame: 'animated' }, global });
    const selects = wrapper.findAllComponents(Select);
    expect(selects).toHaveLength(2);
    expect(selects[1]!.props('modelValue')).toBe('purple-haze');
    expect(selects[1]!.props('options')!.map((option) => option.label)).toEqual([
      'Purple Haze',
      'Neon Duo',
      'Aurora',
      'Ember',
      'Electric',
    ]);
    expect(selects[1]!.props('options')!.every((option) => option.thumbnail)).toBe(true);
    expect(wrapper.find('#frame-title').exists()).toBe(false);
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(false);
    expect(wrapper.find('.color-stub').exists()).toBe(false);
    expect(wrapper.findAll('.slider-stub')).toHaveLength(2);
    for (const preset of ['purple-haze', 'neon-duo', 'aurora', 'ember', 'electric']) {
      await wrapper.findAll('select')[1]!.setValue(preset);
      expect(wrapper.emitted('update')).toContainEqual([{ animatedFrame: { ...DEFAULT_ANIMATED_FRAME, preset } }]);
    }
    wrapper.unmount();
  });

  it('preserves width and a frozen speed when switching presets or disabling the frame', async () => {
    const saved = { preset: 'aurora' as const, width: 8, speed: 0 };
    const wrapper = mount(BorderAndFrameControls, { props: { frame: 'animated', animatedFrame: saved }, global });
    await wrapper.findAll('select')[1]!.setValue('electric');
    expect(wrapper.emitted('update')).toContainEqual([{ animatedFrame: { ...saved, preset: 'electric' } }]);
    await wrapper.findAll('.switch-stub')[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'none' }]);
    await wrapper.setProps({ frame: 'none' });
    await wrapper.findAll('.switch-stub')[1]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ frame: 'animated' }]);
    expect(wrapper.props('animatedFrame')).toEqual(saved);
    wrapper.unmount();
  });

  it('edits animated width and speed independently and rejects unknown select values', async () => {
    const saved = { preset: 'neon-duo' as const, width: 5, speed: 1.5 };
    const wrapper = mount(BorderAndFrameControls, { props: { frame: 'animated', animatedFrame: saved }, global });
    const sliders = wrapper.findAll('.slider-stub');
    await sliders[0]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ animatedFrame: { ...saved, width: 12 } }]);
    wrapper.findAllComponents(BigSliderComponent)[1]!.vm.$emit('update:modelValue', 2.5);
    expect(wrapper.emitted('update')).toContainEqual([{ animatedFrame: { ...saved, speed: 2.5 } }]);
    const before = wrapper.emitted('update')!.length;
    const selects = wrapper.findAllComponents(Select);
    selects[0]!.vm.$emit('update:modelValue', 'unknown');
    selects[1]!.vm.$emit('update:modelValue', 99);
    expect(wrapper.emitted('update')).toHaveLength(before);
    wrapper.unmount();
  });

  it('formats border thickness, window scale and animation speed with their displayed units', async () => {
    const wrapper = mount(BorderAndFrameControls, { props: { borderEnabled: true, frame: 'safari' }, global });
    const sliders = () => wrapper.findAllComponents(BigSliderComponent);
    expect(sliders()[0]!.props('formatValue')!(2.4)).toBe('2px');
    expect(sliders()[1]!.props('formatValue')!(125)).toBe('125%');
    await wrapper.setProps({ frame: 'animated' });
    expect(sliders()[1]!.props('formatValue')!(3)).toBe('3px');
    expect(sliders()[2]!.props('formatValue')!(1.5)).toBe('1.5×');
    wrapper.unmount();
  });

  it.each(['safari', 'windows-95', 'iphone-16-max', 'pixel-9-pro'] as const)(
    'shows and emits the shared frame color for %s',
    async (frame) => {
      const wrapper = mount(BorderAndFrameControls, {
        props: {
          frame,
          frameColor: '#abcdef',
          ...(frame === 'iphone-16-max' || frame === 'pixel-9-pro'
            ? { phoneFrameFill: { kind: 'color' as const, color: '#000000' } }
            : {}),
        },
        global,
      });

      const colors = wrapper.findAll('.color-stub');
      expect(colors.length).toBe(frame === 'iphone-16-max' || frame === 'pixel-9-pro' ? 2 : 1);
      await colors[0]!.trigger('click');
      expect(wrapper.emitted('update')).toContainEqual([{ frameColor: '#123456' }]);
    },
  );

  it.each(['iphone-16-max', 'pixel-9-pro'] as const)(
    'keeps phone frame fill separate from frame color for %s',
    async (frame) => {
      const wrapper = mount(BorderAndFrameControls, {
        props: {
          frame,
          frameColor: '#abcdef',
          phoneFrameFill: { kind: 'color', color: '#000000' },
        },
        global,
      });

      const colors = wrapper.findAll('.color-stub');
      expect(colors).toHaveLength(2);
      await colors[1]!.trigger('click');
      expect(wrapper.emitted('update')).toContainEqual([{ phoneFrameFill: { kind: 'color', color: '#123456' } }]);
    },
  );

  it('only exposes the phone fit background controls for phone frames', async () => {
    const wrapper = mount(BorderAndFrameControls, {
      props: {
        frame: 'safari',
        phoneFrameFill: { kind: 'color', color: '#000000' },
      },
      global,
    });

    expect(wrapper.find('.phone-fill-controls').exists()).toBe(false);

    await wrapper.setProps({ frame: 'iphone-16-max' });
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(true);
    expect(
      wrapper
        .find('.phone-fill-controls')
        .findAll('.frame-button')
        .map((button) => button.text()),
    ).toEqual(['Color', 'Gradient', 'Adaptive', 'Continuity']);

    await wrapper.setProps({ frame: 'safari' });
    expect(wrapper.find('.phone-fill-controls').exists()).toBe(false);
  });
});
