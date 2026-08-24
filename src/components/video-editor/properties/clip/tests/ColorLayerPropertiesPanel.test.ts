import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorClip } from '~/media/shared/composition-types';
import ColorLayerPropertiesPanel from '../ColorLayerPropertiesPanel.vue';
import ColorLayerAppearanceControls from '../ColorLayerAppearanceControls.vue';
import AddTileButton from '../../../../ui/button/AddTileButton.vue';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
  },
}));

vi.mock('../../../../../api/capture', () => ({ capture }));

const Button = {
  inheritAttrs: false,
  props: ['variant', 'size', 'block', 'icon'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :class="[\'btn\', $attrs.class]" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>',
};
const Popover = defineComponent({
  emits: ['toggle'],
  setup(_, { emit, slots }) {
    const open = ref(false);
    const close = () => {
      open.value = false;
      emit('toggle', false);
    };
    const toggle = () => {
      open.value = !open.value;
      emit('toggle', open.value);
    };
    return () =>
      h('div', { class: 'popover-stub' }, [
        h('div', { class: 'popover-trigger', onClick: toggle }, slots.trigger?.({ isOpen: open.value })),
        open.value ? h('div', { class: 'popover-content' }, slots.default?.({ close })) : undefined,
      ]);
  },
});
const BackgroundPresetComposer = defineComponent({
  props: {
    kind: { type: String, required: true },
    color: { type: String, required: true },
    gradient: { type: Object, required: true },
  },
  emits: ['add-color', 'add-gradient'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          class: 'composer-stub',
          'data-color': props.color,
          'data-gradient': JSON.stringify(props.gradient),
        },
        [
          props.kind === 'color'
            ? h('button', { class: 'composer-add-color', onClick: () => emit('add-color', '#abcdef') }, 'add color')
            : h(
                'button',
                { class: 'composer-add-gradient', onClick: () => emit('add-gradient', props.gradient) },
                'add gradient',
              ),
        ],
      );
  },
});
const BigSlider = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: { type: Number, required: true },
    label: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, required: true },
    defaultValue: { type: Number, required: true },
  },
  emits: ['update:modelValue', 'interaction-start', 'interaction-end'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'big-slider-stub',
          'data-label': props.label,
          'data-model-value': props.modelValue,
          onClick: () => emit('update:modelValue', props.modelValue + props.step),
          onPointerdown: () => emit('interaction-start'),
          onPointerup: () => emit('interaction-end'),
        },
        props.label,
      );
  },
});
const Switch = defineComponent({
  name: 'Switch',
  props: {
    modelValue: { type: Boolean, required: true },
    label: { type: String, default: '' },
    ariaLabel: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'switch-stub',
          role: 'switch',
          'aria-label': props.ariaLabel || props.label,
          'aria-checked': props.modelValue,
          onClick: () => emit('update:modelValue', !props.modelValue),
        },
        props.label,
      );
  },
});
const ShadowDirectionGroup = defineComponent({
  name: 'ShadowDirectionGroup',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () =>
      h('button', { class: 'direction-stub', onClick: () => emit('update:modelValue', 'top-left') }, 'direction');
  },
});
const ColorPicker = defineComponent({
  name: 'ColorPicker',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('button', { class: 'color-stub', onClick: () => emit('update:modelValue', '#abcdef') }, 'color');
  },
});

const radialGradient = {
  type: 'radial' as const,
  angle: 45,
  stops: [
    { id: 'inner', position: 0, color: '#000000', alpha: 1 },
    { id: 'outer', position: 1, color: '#ffffff', alpha: 0.5 },
  ],
};

const linearGradient = {
  type: 'linear' as const,
  angle: 135,
  stops: [
    { id: 'start', position: 0, color: '#111827', alpha: 1 },
    { id: 'end', position: 1, color: '#ffffff', alpha: 1 },
  ],
};

const colorClip = (
  fill: ColorClip['fill'] = { kind: 'color', color: '#111827' },
  style: Pick<
    ColorClip,
    | 'opacityEnabled'
    | 'opacity'
    | 'cornerRadius'
    | 'shadowSize'
    | 'shadowBlur'
    | 'shadowMode'
    | 'shadowColor'
    | 'shadowDirection'
    | 'backdropBlurEnabled'
    | 'backdropBlur'
  > = {},
): ColorClip => ({
  id: 'color-clip',
  kind: 'color',
  name: 'Color layer',
  timelineStartMs: 0,
  timelineDurationMs: 3_000,
  sourceInMs: 0,
  sourceDurationMs: 3_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  trackId: 'track-color',
  assetId: '',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  fill,
  ...style,
});

const preferences = (gradients: (typeof radialGradient)[] = []) => ({
  schemaVersion: 3,
  theme: 'dark',
  recordingBar: { visibility: 'always' },
  devices: {},
  shortcuts: {},
  backgroundPresets: { colors: [], gradients },
  extras: {},
});

const mountPanel = async (clip: ColorClip) => {
  const wrapper = mount(ColorLayerPropertiesPanel, {
    props: { clip },
    global: { stubs: { Button, Popover, BackgroundPresetComposer, BigSlider, Switch } },
  });
  await flushPromises();
  return wrapper;
};

const mountAppearance = (clip: ColorClip) =>
  mount(ColorLayerAppearanceControls, {
    props: { clip },
    global: { stubs: { Button, BigSlider, Switch, ShadowDirectionGroup, ColorPicker } },
  });

beforeEach(() => {
  vi.clearAllMocks();
  capture.getPreferences.mockResolvedValue(preferences());
  capture.updatePreferences.mockResolvedValue(preferences());
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

describe('ColorLayerPropertiesPanel', () => {
  it('offers the shared Color and Gradient button group and marks a solid preset active', async () => {
    const wrapper = await mountPanel(colorClip());
    const modes = wrapper.findAll('.kind-group .btn');

    expect(modes).toHaveLength(2);
    expect(modes.map((mode) => mode.text())).toEqual(['Color', 'Gradient']);
    expect(modes[0]?.attributes('data-variant')).toBe('primary');
    expect(modes[1]?.attributes('data-variant')).toBe('ghost');
    expect(wrapper.find('.preset-tile.active').attributes('aria-label')).toBe('#111827');

    await modes[1]!.trigger('click');
    expect(wrapper.findAll('.kind-group .btn')[1]?.attributes('data-variant')).toBe('primary');
    expect(wrapper.findAll('.preset-tile').length).toBeGreaterThan(1);
    wrapper.unmount();
  });

  it('uses the shared add tile to open and apply custom color and gradient composers', async () => {
    const wrapper = await mountPanel(colorClip());
    const colorAdd = wrapper.findComponent(AddTileButton);
    expect(colorAdd.props('label')).toBe('Custom color');

    await colorAdd.trigger('click');
    expect(wrapper.find('.composer-stub').exists()).toBe(true);
    await wrapper.get('.composer-add-color').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ kind: 'color', color: '#abcdef' });

    await wrapper.findAll('.kind-group .btn')[1]!.trigger('click');
    const gradientAdd = wrapper.findComponent(AddTileButton);
    expect(gradientAdd.props('label')).toBe('Custom gradient');
    await gradientAdd.trigger('click');
    expect(wrapper.find('.composer-stub').exists()).toBe(true);
    await wrapper.get('.composer-add-gradient').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toMatchObject({ kind: 'gradient' });
    wrapper.unmount();
  });

  it('starts custom color and gradient additions from an independent draft', async () => {
    const wrapper = await mountPanel(colorClip());
    await wrapper.findComponent(AddTileButton).trigger('click');
    const colorComposer = wrapper.get('.composer-stub');
    expect(colorComposer.attributes('data-color')).not.toBe('#111827');
    await colorComposer.get('.composer-add-color').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ kind: 'color', color: '#abcdef' });
    wrapper.unmount();

    capture.getPreferences.mockResolvedValue(preferences([radialGradient]));
    const gradientWrapper = await mountPanel(colorClip({ kind: 'gradient', gradient: radialGradient }));
    await gradientWrapper.findComponent(AddTileButton).trigger('click');
    const gradientComposer = gradientWrapper.get('.composer-stub');
    expect(gradientComposer.attributes('data-gradient')).not.toBe(JSON.stringify(radialGradient));
    await gradientComposer.get('.composer-add-gradient').trigger('click');
    await flushPromises();
    expect(gradientWrapper.emitted('update')?.at(-1)?.[0]).toMatchObject({ kind: 'gradient' });
    gradientWrapper.unmount();
  });

  it('emits a color fill when a shared solid preset is selected', async () => {
    const wrapper = await mountPanel(colorClip());
    const white = wrapper.findAll('.preset-tile').find((tile) => tile.attributes('aria-label') === '#ffffff');

    expect(white).toBeDefined();
    await white!.trigger('click');

    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ kind: 'color', color: '#ffffff' }]);
    wrapper.unmount();
  });

  it('renders and applies a saved radial gradient preset', async () => {
    capture.getPreferences.mockResolvedValue(preferences([radialGradient]));
    const wrapper = await mountPanel(colorClip({ kind: 'gradient', gradient: linearGradient }));
    const radial = wrapper
      .findAll('.preset-tile')
      .find((tile) => tile.attributes('style')?.includes('radial-gradient(circle'));

    expect(radial).toBeDefined();
    expect(radial!.attributes('style')).toContain('rgba(0, 0, 0, 1)');
    expect(radial!.attributes('style')).toContain('rgba(255, 255, 255, 0.5)');

    await radial!.trigger('click');
    expect(wrapper.emitted('update')?.at(-1)?.[0]).toEqual({ kind: 'gradient', gradient: radialGradient });
    wrapper.unmount();
  });

  it('uses media-style radius and shadow presets plus conditional advanced controls', async () => {
    const wrapper = mountAppearance(
      colorClip(
        { kind: 'color', color: '#111827' },
        {
          opacityEnabled: true,
          opacity: 70,
          cornerRadius: 'none',
          shadowSize: 'none',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#000000',
          shadowDirection: 'all',
          backdropBlurEnabled: false,
          backdropBlur: 35,
        },
      ),
    );
    const radiusGroup = wrapper
      .findAll('.appearance-controls .btn-group')
      .find((group) => group.text().includes('16px'));
    expect(radiusGroup).toBeDefined();
    await radiusGroup!
      .findAll('.btn')
      .find((button) => button.text() === '16px')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ cornerRadius: expect.anything() })]);

    const shadowGroup = wrapper
      .findAll('.appearance-controls .btn-group')
      .find((group) => group.text().includes('Soft'));
    expect(shadowGroup).toBeDefined();
    await shadowGroup!
      .findAll('.btn')
      .find((button) => button.text() === 'None')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ shadowSize: 'none' })]);
    await shadowGroup!
      .findAll('.btn')
      .find((button) => button.text() === 'Soft')!
      .trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([expect.objectContaining({ shadowSize: 'sm' })]);

    const advancedShadow = wrapper
      .findAll('.appearance-controls button')
      .find((button) => /custom|advanced/i.test(button.attributes('aria-label') ?? button.text()));
    expect(advancedShadow).toBeDefined();
    await advancedShadow!.trigger('click');
    await wrapper.setProps({
      clip: colorClip(
        { kind: 'color', color: '#111827' },
        {
          opacityEnabled: true,
          opacity: 70,
          cornerRadius: 'md',
          shadowSize: 'custom',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#000000',
          shadowDirection: 'all',
          backdropBlurEnabled: false,
          backdropBlur: 35,
        },
      ),
    });
    const shadowSlider = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => /shadow/i.test(String(slider.props('label'))));
    expect(shadowSlider).toBeDefined();
    shadowSlider!.vm.$emit('update:modelValue', 44);
    expect(wrapper.emitted('update')).toContainEqual([
      expect.objectContaining({ shadowSize: 'custom', shadowBlur: 44 }),
    ]);
    wrapper.unmount();
  });

  it('toggles opacity and backdrop blur and only shows their sliders when enabled', async () => {
    const wrapper = mountAppearance(
      colorClip(
        { kind: 'color', color: '#111827' },
        {
          opacityEnabled: true,
          opacity: 70,
          cornerRadius: 'none',
          shadowSize: 'none',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#000000',
          shadowDirection: 'all',
          backdropBlurEnabled: false,
          backdropBlur: 35,
        },
      ),
    );
    const opacityToggle = wrapper
      .findAll('.appearance-controls .switch-stub')
      .find((toggle) => /opacity/i.test(toggle.attributes('aria-label') ?? ''));
    const backdropToggle = wrapper
      .findAll('.appearance-controls .switch-stub')
      .find((toggle) => /backdrop|background blur/i.test(toggle.attributes('aria-label') ?? ''));
    expect(opacityToggle).toBeDefined();
    expect(backdropToggle).toBeDefined();

    const opacitySlider = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => /opacity/i.test(String(slider.props('label'))));
    expect(opacitySlider).toBeDefined();
    opacitySlider!.vm.$emit('update:modelValue', 61);
    expect(wrapper.emitted('update')).toContainEqual([{ opacity: 61 }]);
    await opacityToggle!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ opacityEnabled: false }]);
    await wrapper.setProps({
      clip: colorClip(
        { kind: 'color', color: '#111827' },
        {
          opacityEnabled: false,
          opacity: 61,
          cornerRadius: 'none',
          shadowSize: 'none',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#000000',
          shadowDirection: 'all',
          backdropBlurEnabled: false,
          backdropBlur: 35,
        },
      ),
    });
    expect(wrapper.findAllComponents(BigSlider).some((slider) => /opacity/i.test(String(slider.props('label'))))).toBe(
      false,
    );

    await backdropToggle!.trigger('click');
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{ backdropBlurEnabled: true }]);
    await wrapper.setProps({
      clip: colorClip(
        { kind: 'color', color: '#111827' },
        {
          opacityEnabled: false,
          opacity: 61,
          cornerRadius: 'none',
          shadowSize: 'none',
          shadowBlur: 40,
          shadowMode: 'solid',
          shadowColor: '#000000',
          shadowDirection: 'all',
          backdropBlurEnabled: true,
          backdropBlur: 40,
        },
      ),
    });
    const backdropSlider = wrapper
      .findAllComponents(BigSlider)
      .find((slider) => /backdrop|background blur/i.test(String(slider.props('label'))));
    expect(backdropSlider).toBeDefined();
    backdropSlider!.vm.$emit('update:modelValue', 55);
    expect(wrapper.emitted('update')).toContainEqual([{ backdropBlur: 55 }]);
    wrapper.unmount();
  });

  it('relays custom radius drag interaction state through the color layer panel', async () => {
    const wrapper = await mountPanel(
      colorClip(
        { kind: 'color', color: '#111827' },
        {
          cornerRadius: 32,
          shadowSize: 'none',
          opacityEnabled: false,
          backdropBlurEnabled: false,
        },
      ),
    );
    const radiusSlider = wrapper
      .findAll('.big-slider-stub')
      .find((slider) => slider.attributes('data-label')?.toLowerCase().includes('radius'));

    expect(radiusSlider).toBeDefined();
    await radiusSlider!.trigger('pointerdown');
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

    await radiusSlider!.trigger('pointerup');
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it('keeps color layer handles muted for 500 ms after a radius preset change', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = await mountPanel(
        colorClip(
          { kind: 'color', color: '#111827' },
          {
            cornerRadius: 'sm',
            shadowSize: 'none',
            opacityEnabled: false,
            backdropBlurEnabled: false,
          },
        ),
      );
      const mediumPreset = wrapper.findAll('.appearance-controls .btn').find((button) => button.text() === '16px');

      expect(mediumPreset).toBeDefined();
      await mediumPreset!.trigger('click');
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

      vi.advanceTimersByTime(499);
      await Promise.resolve();
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

      vi.advanceTimersByTime(1);
      await Promise.resolve();
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false]]);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
