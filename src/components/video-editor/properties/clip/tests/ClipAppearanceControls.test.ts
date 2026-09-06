import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelectedClipProperties } from '../../properties-panel-types';
import ClipAppearanceControls from '../ClipAppearanceControls.vue';

const Button = defineComponent({
  name: 'Button',
  inheritAttrs: false,
  props: {
    variant: { type: String, default: 'ghost' },
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          class: ['btn', attrs.class],
          'data-variant': props.variant,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

const ButtonGroup = defineComponent({
  name: 'ButtonGroup',
  setup(_, { slots }) {
    return () => h('div', { class: 'btn-group' }, slots.default?.());
  },
});

const BigSlider = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: { type: Number, default: 0 },
    label: { type: String, default: '' },
    step: { type: Number, default: 1 },
    formatValue: { type: Function, default: undefined },
  },
  emits: ['update:modelValue', 'interaction-start', 'interaction-end'],
  setup(props, { emit }) {
    return () => {
      const format = props.formatValue as ((value: number) => string) | undefined;
      return h('div', { class: 'big-slider-stub', 'data-label': props.label }, [
        h('span', { class: 'big-slider-label' }, props.label),
        h('span', { class: 'big-slider-value' }, format ? format(props.modelValue) : String(props.modelValue)),
        h(
          'button',
          {
            class: 'slider-update',
            onClick: () => emit('update:modelValue', props.modelValue + props.step),
          },
          'update',
        ),
        h('button', { class: 'slider-start', onClick: () => emit('interaction-start') }, 'start'),
        h('button', { class: 'slider-end', onClick: () => emit('interaction-end') }, 'end'),
      ]);
    };
  },
});

const ColorPicker = defineComponent({
  name: 'ColorPicker',
  props: {
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'color-picker-stub',
          'data-color': props.modelValue,
          onClick: () => emit('update:modelValue', '#123456'),
        },
        'color',
      );
  },
});

const ShadowDirectionGroup = defineComponent({
  name: 'ShadowDirectionGroup',
  props: {
    modelValue: { type: String, default: 'all' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const directions = ['all', 'bottom', 'bottom-right', 'top-left'];
    return () =>
      h(
        'div',
        { class: 'direction-group-stub' },
        directions.map((direction) =>
          h(
            'button',
            {
              class: ['direction-button', { active: props.modelValue === direction }],
              'data-direction': direction,
              onClick: () => emit('update:modelValue', direction),
            },
            direction,
          ),
        ),
      );
  },
});

const BorderAndFrameControls = defineComponent({
  name: 'BorderAndFrameControls',
  props: {
    borderEnabled: Boolean,
    borderColor: String,
    borderWidth: Number,
    frame: String,
    frameTitle: String,
    frameColor: String,
    frameShowMenu: Boolean,
    frameShowScrollbars: Boolean,
    frameChromeScale: Number,
  },
  emits: ['update'],
  setup(_, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'border-frame-stub',
          onClick: () => emit('update', { borderEnabled: false, frame: 'windows-95', frameChromeScale: 1.25 }),
        },
        'border and frame',
      );
  },
});

const Divider = defineComponent({
  name: 'Divider',
  template: '<hr class="divider-stub" />',
});

const clip = (overrides: Partial<SelectedClipProperties> = {}): SelectedClipProperties => ({
  id: 'clip-1',
  kind: 'screen',
  name: 'Screen recording',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  shadowSize: 'md',
  shadowBlur: 40,
  shadowMode: 'solid',
  shadowColor: '#111111',
  shadowDirection: 'all',
  cornerRadius: 'md',
  borderEnabled: false,
  borderColor: '#222222',
  borderWidth: 2,
  frame: 'safari',
  frameTitle: 'Demo',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
  isMirrored: false,
  isMirroredY: false,
  ...overrides,
});

const mountAppearance = (selectedClip = clip()) =>
  mount(ClipAppearanceControls, {
    props: { selectedClip },
    global: {
      stubs: {
        Button,
        ButtonGroup,
        BigSlider,
        ColorPicker,
        ShadowDirectionGroup,
        BorderAndFrameControls,
        Divider,
      },
    },
  });

const buttonWithText = (wrapper: ReturnType<typeof mountAppearance>, text: string) =>
  wrapper.findAll('.btn').find((item) => item.text().trim().toLowerCase() === text.toLowerCase());

afterEach(() => {
  vi.useRealTimers();
});

describe('ClipAppearanceControls', () => {
  it('renders formatted radius and blur values and exposes the current shadow options', () => {
    const wrapper = mountAppearance(
      clip({ cornerRadius: 32, shadowSize: 'custom', shadowBlur: 44, shadowMode: 'solid', shadowDirection: 'bottom' }),
    );

    const sliders = wrapper.findAll('.big-slider-stub');
    expect(sliders).toHaveLength(2);
    expect(sliders[0]!.attributes('data-label')).toMatch(/radius/i);
    expect(sliders[0]!.find('.big-slider-value').text()).toBe('32px');
    expect(sliders[1]!.attributes('data-label')).toMatch(/blur/i);
    expect(sliders[1]!.find('.big-slider-value').text()).toBe('44px');
    expect(wrapper.get('.direction-button[data-direction="bottom"]').classes()).toContain('active');
    expect(wrapper.get('.color-picker-stub').attributes('data-color')).toBe('#111111');
    expect(wrapper.find('.shadow-hint').exists()).toBe(false);
  });

  it('updates radius presets and commits custom slider interactions once at the boundary', async () => {
    vi.useFakeTimers();
    const wrapper = mountAppearance(clip({ cornerRadius: 'md' }));

    await buttonWithText(wrapper, '8px')!.trigger('click');
    expect(wrapper.emitted('update:cornerRadius')).toContainEqual(['sm']);
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);
    vi.runAllTimers();
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false]]);

    const radiusGroup = wrapper.findAll('.btn-group')[0]!;
    await radiusGroup
      .findAll('.btn')
      .find((item) => item.attributes('aria-label')?.toLowerCase() === 'custom')!
      .trigger('click');
    expect(wrapper.emitted('update:cornerRadius')).toContainEqual(['32']);
    const slider = wrapper.findComponent(BigSlider);
    expect(slider.find('.big-slider-value').text()).toBe('32px');

    await slider.get('.slider-start').trigger('click');
    slider.vm.$emit('update:modelValue', 47);
    expect(wrapper.emitted('update:cornerRadius')).toContainEqual(['47']);
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false], [true]]);
    await slider.get('.slider-end').trigger('click');
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false], [true], [false]]);
    await nextTick();
    expect(slider.find('.big-slider-value').text()).toBe('47px');
  });

  it('selects shadow presets, modes, blur, colors, and directions with the full payload', async () => {
    const wrapper = mountAppearance(clip({ shadowSize: 'none', shadowBlur: 22, shadowColor: '#abcdef' }));

    expect(wrapper.find('.direction-group-stub').exists()).toBe(false);
    expect(wrapper.find('.color-picker-stub').exists()).toBe(false);
    expect(wrapper.findAll('.big-slider-stub')).toHaveLength(0);

    await buttonWithText(wrapper, 'soft')!.trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'sm', blur: 22, mode: 'solid', color: '#abcdef', direction: 'all' },
    ]);
    expect(wrapper.find('.direction-group-stub').exists()).toBe(true);
    expect(wrapper.find('.color-picker-stub').exists()).toBe(true);

    await buttonWithText(wrapper, 'adaptive')!.trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'sm', blur: 22, mode: 'adaptive', color: '#abcdef', direction: 'all' },
    ]);
    expect(wrapper.find('.shadow-hint').exists()).toBe(true);
    expect(wrapper.find('.color-picker-stub').exists()).toBe(false);

    await buttonWithText(wrapper, 'solid')!.trigger('click');
    await wrapper.get('.color-picker-stub').trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'sm', blur: 22, mode: 'solid', color: '#123456', direction: 'all' },
    ]);
    await wrapper.get('.direction-button[data-direction="bottom-right"]').trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'sm', blur: 22, mode: 'solid', color: '#123456', direction: 'bottom-right' },
    ]);

    const shadowGroup = wrapper.findAll('.btn-group')[1]!;
    await shadowGroup
      .findAll('.btn')
      .find((item) => item.attributes('aria-label')?.toLowerCase() === 'custom')!
      .trigger('click');
    const blurSlider = wrapper.findComponent(BigSlider);
    expect(blurSlider.find('.big-slider-value').text()).toBe('22px');
    blurSlider.vm.$emit('update:modelValue', 48);
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'custom', blur: 48, mode: 'solid', color: '#123456', direction: 'bottom-right' },
    ]);

    await shadowGroup
      .findAll('.btn')
      .find((item) => item.text().trim().toLowerCase() === 'none')!
      .trigger('click');
    expect(wrapper.find('.direction-group-stub').exists()).toBe(false);
    expect(wrapper.find('.color-picker-stub').exists()).toBe(false);
    expect(wrapper.findAll('.big-slider-stub')).toHaveLength(0);
  });

  it('synchronizes radius and shadow state when the selected clip changes', async () => {
    const wrapper = mountAppearance(clip({ cornerRadius: 18, shadowSize: 'custom', shadowBlur: 51 }));

    expect(wrapper.findAll('.big-slider-stub')[0]!.find('.big-slider-value').text()).toBe('18px');
    expect(wrapper.findAll('.big-slider-stub')[1]!.find('.big-slider-value').text()).toBe('51px');

    await wrapper.setProps({
      selectedClip: clip({
        id: 'clip-2',
        cornerRadius: 'full',
        shadowSize: 'none',
        shadowBlur: undefined,
        shadowMode: undefined,
        shadowColor: undefined,
        shadowDirection: undefined,
      }),
    });
    await nextTick();

    expect(wrapper.findAll('.big-slider-stub')).toHaveLength(1);
    expect(wrapper.find('.big-slider-value').text()).toBe('9999px');
    expect(wrapper.find('.direction-group-stub').exists()).toBe(false);
    expect(wrapper.find('.color-picker-stub').exists()).toBe(false);

    await wrapper.setProps({
      selectedClip: clip({
        id: 'clip-3',
        cornerRadius: '12px',
        shadowSize: 'md',
        shadowBlur: 60,
        shadowMode: 'adaptive',
        shadowColor: '#654321',
        shadowDirection: 'top-left',
      }),
    });
    await nextTick();
    expect(wrapper.findAll('.big-slider-stub')).toHaveLength(1);
    expect(wrapper.find('.big-slider-value').text()).toBe('12px');
    expect(wrapper.find('.shadow-hint').exists()).toBe(true);
    expect(wrapper.get('.direction-button[data-direction="top-left"]').classes()).toContain('active');
  });

  it('relays mirroring and border/frame updates and reflects mirrored props', async () => {
    const wrapper = mountAppearance(
      clip({
        isMirrored: false,
        isMirroredY: true,
        borderEnabled: true,
        borderColor: '#123123',
        borderWidth: 7,
        frame: 'windows-95',
        frameTitle: 'Beam',
        frameColor: '#ababab',
        frameShowMenu: false,
        frameShowScrollbars: true,
        frameChromeScale: 1.4,
      }),
    );

    const horizontal = buttonWithText(wrapper, 'horizontal')!;
    const vertical = buttonWithText(wrapper, 'vertical')!;
    expect(horizontal.attributes('data-variant')).toBe('ghost');
    expect(vertical.attributes('data-variant')).toBe('primary');

    await horizontal.trigger('click');
    expect(wrapper.emitted('update:isMirrored')).toEqual([[true]]);
    await vertical.trigger('click');
    expect(wrapper.emitted('update:isMirroredY')).toEqual([[false]]);

    const frame = wrapper.findComponent(BorderAndFrameControls);
    expect(frame.props('borderEnabled')).toBe(true);
    expect(frame.props('borderColor')).toBe('#123123');
    expect(frame.props('borderWidth')).toBe(7);
    expect(frame.props('frame')).toBe('windows-95');
    expect(frame.props('frameTitle')).toBe('Beam');
    expect(frame.props('frameColor')).toBe('#ababab');
    expect(frame.props('frameShowMenu')).toBe(false);
    expect(frame.props('frameShowScrollbars')).toBe(true);
    expect(frame.props('frameChromeScale')).toBe(1.4);

    const appearance = { borderEnabled: false, frame: 'windows-95' as const, frameChromeScale: 1.25 };
    frame.vm.$emit('update', appearance);
    expect(wrapper.emitted('update:appearance')).toEqual([[appearance]]);

    await wrapper.setProps({
      selectedClip: clip({
        isMirrored: true,
        isMirroredY: false,
        borderEnabled: true,
        borderColor: '#123123',
        borderWidth: 7,
        frame: 'windows-95',
        frameTitle: 'Beam',
        frameColor: '#ababab',
        frameShowMenu: false,
        frameShowScrollbars: true,
        frameChromeScale: 1.4,
      }),
    });
    await nextTick();
    expect(buttonWithText(wrapper, 'horizontal')!.attributes('data-variant')).toBe('primary');
    expect(buttonWithText(wrapper, 'vertical')!.attributes('data-variant')).toBe('ghost');
  });
});
