import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
import ShapeLayerPropertiesPanel from '../ShapeLayerPropertiesPanel.vue';

type ShapeClipOverrides = Partial<ShapeClip> & {
  opacityEnabled?: boolean;
  backdropBlur?: number;
};

const clip = (overrides: ShapeClipOverrides = {}): ShapeClip =>
  ({
    id: 'shape',
    trackId: 'shape-track',
    kind: 'shape',
    name: 'Shape',
    assetId: '',
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
    family: 'shape',
    preset: 'rounded-rectangle',
    fillColor: '#ff5a1f',
    borderColor: '#ffffff',
    borderWidth: 0,
    cornerRadius: 16,
    arrowThickness: 36,
    arrowHeadSize: 38,
    rotation: 0,
    opacityEnabled: false,
    opacity: 70,
    backdropBlur: 35,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowBlur: 32,
    shadowDirection: 'bottom-right',
    ...overrides,
  }) as ShapeClip;

const stubs = {
  Button: {
    props: {
      block: Boolean,
      icon: [Object, Function],
      iconOnly: Boolean,
      tooltip: String,
      variant: String,
    },
    emits: ['click'],
    template:
      '<button :data-block="block || undefined" :data-icon-only="iconOnly || undefined" @click="$emit(\'click\')"><slot /></button>',
  },
  ButtonGroup: {
    props: { full: Boolean, columns: Number },
    template: '<div class="button-group-stub" :class="{ \'is-full\': full }" :data-columns="columns"><slot /></div>',
  },
  BigSlider: {
    props: { label: String, modelValue: Number },
    template: '<div class="slider-stub" :data-label="label" :data-value="modelValue" />',
  },
  ColorPicker: { props: ['label'], template: '<div class="color-picker-stub" :data-label="label" />' },
  Divider: { template: '<hr />' },
  Switch: {
    props: { modelValue: Boolean, ariaLabel: String },
    emits: ['update:modelValue'],
    template:
      '<button class="switch-stub" :aria-label="ariaLabel" :aria-pressed="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
  ShadowDirectionGroup: { template: '<div class="direction-stub" />' },
};

const sliderLabels = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('.slider-stub').map((slider) => slider.attributes('data-label'));

describe('ShapeLayerPropertiesPanel', () => {
  it('switches between shape and arrow families using family defaults', async () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, { props: { clip: clip() }, global: { stubs } });
    const arrows = wrapper.findAll('button').find((button) => button.text() === 'Arrows');

    expect(arrows).toBeDefined();
    expect(wrapper.findAll('.button-group-stub').every((group) => group.classes('is-full'))).toBe(true);
    const rectangle = wrapper.get('[aria-label="Rectangle"]');
    expect(rectangle.attributes('data-block')).toBe('true');
    expect(rectangle.attributes('data-icon-only')).toBeUndefined();
    await arrows!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ family: 'arrow', preset: 'arrow' }]);
    await wrapper.setProps({ clip: clip({ family: 'arrow', preset: 'arrow' }) });
    expect(wrapper.find('[aria-label="Arrow"]').exists()).toBe(false);
  });

  it('shows shadow controls only when shadow is enabled', async () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, {
      props: { clip: clip({ shadowEnabled: false }) },
      global: { stubs },
    });

    expect(wrapper.find('.direction-stub').exists()).toBe(false);
    await wrapper.setProps({ clip: clip({ shadowEnabled: true }) });
    expect(wrapper.find('.direction-stub').exists()).toBe(true);
  });

  it('offers full-width shortcuts for common rotations', async () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, { props: { clip: clip() }, global: { stubs } });
    const rotationButtons = wrapper
      .findAll('button')
      .filter((button) => ['0°', '90°', '180°', '270°'].includes(button.text()));

    expect(rotationButtons).toHaveLength(4);
    expect(rotationButtons.every((button) => button.attributes('data-block') === 'true')).toBe(true);
    await rotationButtons[2]!.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ rotation: 180 }]);
  });

  it('does not expose filter controls', () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, { props: { clip: clip() }, global: { stubs } });

    expect(wrapper.find('[aria-label="Filter"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Grayscale');
    expect(wrapper.text()).not.toContain('Sepia');
  });

  it('toggles opacity and only shows opacity-related sliders when enabled', async () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, {
      props: { clip: clip({ opacityEnabled: false }) },
      global: { stubs },
    });

    const opacityToggle = wrapper.get('.switch-stub[aria-label="Item opacity"]');
    expect(opacityToggle.attributes('aria-pressed')).toBe('false');
    expect(sliderLabels(wrapper)).not.toContain('Item opacity');
    expect(sliderLabels(wrapper)).not.toContain('Background blur');

    await opacityToggle.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([{ opacityEnabled: true }]);

    await wrapper.setProps({ clip: clip({ opacityEnabled: true }) });
    expect(sliderLabels(wrapper)).toContain('Item opacity');
    expect(sliderLabels(wrapper)).toContain('Background blur');
  });

  it('uses the color picker labels without rendering duplicate color labels', () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, { props: { clip: clip() }, global: { stubs } });

    expect(wrapper.findAll('.color-picker-stub').map((picker) => picker.attributes('data-label'))).toEqual([
      'Fill color',
      'Border color',
    ]);
    expect(wrapper.find('.color-row').exists()).toBe(false);
  });
});
