import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeClip } from '~/media/shared/composition-types';
import DrawingControls from '~/components/video-editor/elements/DrawingControls.vue';
import ShapeLayerPropertiesPanel from '../ShapeLayerPropertiesPanel.vue';

const { capture } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
  },
}));

vi.mock('../../../../../api/capture', () => ({ capture }));

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

const ColorPickerStub = {
  name: 'ColorPickerStub',
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="color-picker-stub" :data-label="label" :data-value="modelValue" />',
};

const ColorFillPresetControlsStub = {
  name: 'ColorFillPresetControlsStub',
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<div class="color-fill-preset-controls-stub" :data-label="label" :data-kind="modelValue.kind" />',
};

const BigSliderStub = {
  name: 'BigSliderStub',
  props: ['label', 'modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="slider-stub" :data-label="label" :data-value="modelValue" />',
};

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
  BigSlider: BigSliderStub,
  ColorPicker: ColorPickerStub,
  ColorFillPresetControls: ColorFillPresetControlsStub,
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

beforeEach(() => {
  capture.getPreferences.mockResolvedValue({ backgroundPresets: { colors: [], gradients: [] }, extras: {} });
  capture.updatePreferences.mockResolvedValue({ backgroundPresets: { colors: [], gradients: [] }, extras: {} });
  capture.onPreferencesChanged.mockReturnValue(vi.fn());
});

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

  it('labels the shape fill controls and keeps the border picker separate', () => {
    const wrapper = mount(ShapeLayerPropertiesPanel, { props: { clip: clip() }, global: { stubs } });
    const fillControls = wrapper.findComponent(ColorFillPresetControlsStub);

    expect(fillControls.props('label')).toBe('Fill color');
    expect(fillControls.props('modelValue')).toEqual({ kind: 'color', color: '#ff5a1f' });
    expect(wrapper.findAllComponents(ColorPickerStub).map((picker) => picker.props('label'))).toEqual(['Border color']);
    expect(wrapper.find('.color-row').exists()).toBe(false);
  });

  it('shows drawing stroke fill controls with separate border color and width controls', async () => {
    const drawing = {
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
      smoothing: 45,
      strokeWidth: 12,
    };
    const gradientFill = {
      kind: 'gradient' as const,
      gradient: {
        type: 'linear' as const,
        angle: 90,
        stops: [
          { id: 'stroke-start', position: 0, color: '#123456', alpha: 1 },
          { id: 'stroke-end', position: 1, color: '#abcdef', alpha: 0.5 },
        ],
      },
    };
    const wrapper = mount(ShapeLayerPropertiesPanel, {
      props: {
        clip: clip({
          family: 'drawing',
          preset: 'freehand',
          fillColor: '#123456',
          borderColor: '#654321',
          borderWidth: 7,
          drawing,
        }),
      },
      global: { stubs },
    });
    const drawingControls = wrapper.findComponent(DrawingControls);
    const strokeFillControls = drawingControls.findComponent(ColorFillPresetControlsStub);

    expect(strokeFillControls.props('label')).toBe('Stroke color');
    expect(strokeFillControls.props('modelValue')).toEqual({ kind: 'color', color: '#123456' });
    expect(wrapper.findAllComponents(ColorFillPresetControlsStub)).toHaveLength(1);
    const borderPicker = wrapper.findComponent(ColorPickerStub);
    expect(borderPicker.props('label')).toBe('Border color');
    expect(borderPicker.props('modelValue')).toBe('#654321');
    const borderWidth = wrapper
      .findAllComponents(BigSliderStub)
      .find((control) => control.props('label') === 'Border width');
    expect(borderWidth).toBeDefined();
    expect(borderWidth!.props('modelValue')).toBe(7);
    expect(wrapper.text()).not.toContain('Fill color');
    expect(wrapper.findAllComponents(ColorFillPresetControlsStub).map((control) => control.props('label'))).toEqual([
      'Stroke color',
    ]);

    await wrapper.setProps({
      clip: clip({
        family: 'drawing',
        preset: 'freehand',
        fill: gradientFill,
        fillColor: '#123456',
        borderColor: '#654321',
        borderWidth: 7,
        drawing,
      }),
    });
    const gradientStrokeFillControls = wrapper
      .findComponent(DrawingControls)
      .findComponent(ColorFillPresetControlsStub);
    expect(gradientStrokeFillControls.props('label')).toBe('Stroke color');
    expect(gradientStrokeFillControls.props('modelValue')).toEqual(gradientFill);
    expect(wrapper.findAllComponents(ColorFillPresetControlsStub)).toHaveLength(1);
    expect(wrapper.findAllComponents(ColorPickerStub).map((picker) => picker.props('label'))).toEqual(['Border color']);
    expect(
      wrapper
        .findAllComponents(BigSliderStub)
        .find((control) => control.props('label') === 'Border width')
        ?.props('modelValue'),
    ).toBe(7);
    expect(wrapper.text()).not.toContain('Fill color');
    expect(wrapper.findAllComponents(ColorFillPresetControlsStub).map((control) => control.props('label'))).toEqual([
      'Stroke color',
    ]);

    gradientStrokeFillControls.vm.$emit('update:modelValue', gradientFill);
    expect(wrapper.emitted('update')).toEqual([
      [
        {
          fill: gradientFill,
          drawing: { ...drawing, smoothing: 45, strokeWidth: 12 },
        },
      ],
    ]);

    gradientStrokeFillControls.vm.$emit('update:modelValue', { kind: 'color', color: '#abcdef' });
    expect(wrapper.emitted('update')).toEqual([
      [
        {
          fill: gradientFill,
          drawing: { ...drawing, smoothing: 45, strokeWidth: 12 },
        },
      ],
      [
        {
          fill: { kind: 'color', color: '#abcdef' },
          fillColor: '#abcdef',
          drawing: { ...drawing, smoothing: 45, strokeWidth: 12 },
        },
      ],
    ]);

    wrapper.findComponent(ColorPickerStub).vm.$emit('update:modelValue', '#fedcba');
    const updatedBorderWidth = wrapper
      .findAllComponents(BigSliderStub)
      .find((control) => control.props('label') === 'Border width');
    updatedBorderWidth!.vm.$emit('update:modelValue', 11);
    expect(wrapper.emitted('update')).toEqual([
      [
        {
          fill: gradientFill,
          drawing: { ...drawing, smoothing: 45, strokeWidth: 12 },
        },
      ],
      [
        {
          fill: { kind: 'color', color: '#abcdef' },
          fillColor: '#abcdef',
          drawing: { ...drawing, smoothing: 45, strokeWidth: 12 },
        },
      ],
      [{ borderColor: '#fedcba' }],
      [{ borderWidth: 11 }],
    ]);
  });

  it.each(['shape', 'arrow'] as const)('keeps the %s fill and border controls independent', (family) => {
    const gradientFill = {
      kind: 'gradient' as const,
      gradient: {
        type: 'radial' as const,
        angle: 180,
        stops: [
          { id: 'shape-center', position: 0, color: '#ffffff', alpha: 1 },
          { id: 'shape-edge', position: 1, color: '#123456', alpha: 0.75 },
        ],
      },
    };
    const wrapper = mount(ShapeLayerPropertiesPanel, {
      props: {
        clip: clip({
          family,
          preset: family === 'arrow' ? 'arrow' : 'rounded-rectangle',
          fillColor: '#abcdef',
          borderColor: '#654321',
        }),
      },
      global: { stubs },
    });
    const fillControls = wrapper.findComponent(ColorFillPresetControlsStub);
    const borderPicker = wrapper.findComponent(ColorPickerStub);

    expect(fillControls.props('label')).toBe('Fill color');
    expect(fillControls.props('modelValue')).toEqual({ kind: 'color', color: '#abcdef' });
    expect(borderPicker.props('label')).toBe('Border color');
    expect(borderPicker.props('modelValue')).toBe('#654321');

    fillControls.vm.$emit('update:modelValue', gradientFill);
    expect(wrapper.emitted('update')).toEqual([[{ fill: gradientFill }]]);

    borderPicker.vm.$emit('update:modelValue', '#fedcba');
    expect(wrapper.emitted('update')).toEqual([[{ fill: gradientFill }], [{ borderColor: '#fedcba' }]]);
  });
});
