import { defineComponent, h, nextTick, type PropType } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClipPropertiesPanel from '../ClipPropertiesPanel.vue';
import CameraLayoutPanel from '../../camera/CameraLayoutPanel.vue';

const BigSliderStub = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: { type: Number, default: 0 },
    label: { type: String, default: '' },
    formatValue: { type: Function as PropType<(value: number) => string>, default: undefined },
  },
  emits: ['update:modelValue', 'interaction-start', 'interaction-end'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'slider-stub',
          'data-label': props.label,
          onClick: () => emit('update:modelValue', props.modelValue + 10),
          onPointerdown: () => emit('interaction-start'),
          onPointerup: () => emit('interaction-end'),
        },
        [props.label, h('span', { class: 'slider-value' }, props.formatValue?.(props.modelValue) ?? props.modelValue)],
      );
  },
});

const ColorPickerStub = defineComponent({
  name: 'ColorPicker',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () => h('button', { class: 'color-stub', onClick: () => emit('update:modelValue', '#abcdef') }, 'color');
  },
});

const ShadowDirectionStub = defineComponent({
  name: 'ShadowDirectionGroup',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () =>
      h('button', { class: 'direction-stub', onClick: () => emit('update:modelValue', 'top-left') }, 'direction');
  },
});

const FrameStub = defineComponent({
  name: 'BorderAndFrameControls',
  emits: ['update'],
  setup(_, { emit }) {
    return () =>
      h(
        'button',
        { class: 'frame-stub', onClick: () => emit('update', { borderEnabled: true, frame: 'safari' }) },
        'frame',
      );
  },
});

const CropControlsStub = defineComponent({
  name: 'CropControls',
  props: { clip: { type: Object, required: true } },
  emits: ['update', 'preview'],
  setup(_, { emit }) {
    const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
    return () =>
      h('div', { class: 'crop-controls-stub' }, [
        h('button', { class: 'crop-update', onClick: () => emit('update', crop) }, 'crop update'),
        h('button', { class: 'crop-preview', onClick: () => emit('preview', crop) }, 'crop preview'),
      ]);
  },
});

const clip = (overrides: Record<string, unknown> = {}) => ({
  id: 'clip-1',
  kind: 'screen',
  name: 'Screen',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  playbackRate: 1,
  enabled: true,
  isLinked: true,
  shadowSize: 'md',
  shadowColor: '#000000',
  shadowDirection: 'all',
  cornerRadius: 'sm',
  borderEnabled: false,
  clipTransform: { x: 0, y: 0, width: 1, height: 0.5 },
  ...overrides,
});

const mountPanel = (selectedClip: ReturnType<typeof clip> | null = clip()) =>
  mount(ClipPropertiesPanel, {
    props: { selectedClip },
    global: {
      stubs: {
        BigSlider: BigSliderStub,
        ColorPicker: ColorPickerStub,
        ShadowDirectionGroup: ShadowDirectionStub,
        BorderAndFrameControls: FrameStub,
        CropControls: CropControlsStub,
      },
    },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('ClipPropertiesPanel', () => {
  it('renders the empty state when no clip is selected', () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.text()).toContain('No clip selected');
  });

  it('updates placement, radius, shadow, mirror, frame, speed and destructive actions', async () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('.slider-stub')).toHaveLength(4);
    await wrapper.findAll('.slider-stub')[0].trigger('click');
    await wrapper.findAll('.slider-stub')[1].trigger('click');
    await wrapper.findAll('.slider-stub')[2].trigger('click');
    expect(wrapper.emitted('update:clipTransform')).toEqual([
      [{ x: 0.1, y: 0, width: 1, height: 0.5 }],
      [{ x: 0, y: 0.1, width: 1, height: 0.5 }],
      [{ x: 0, y: 0, width: 1.1, height: 0.55 }],
    ]);

    const reset = wrapper.findAll('button').find((button) => button.text().toLowerCase().includes('reset'));
    await reset!.trigger('click');
    expect(wrapper.emitted('reset:clipTransform')).toHaveLength(1);

    const custom = wrapper
      .findAll('button')
      .find(
        (button) =>
          button.text().toLowerCase() === 'custom' || button.attributes('aria-label')?.toLowerCase() === 'custom',
      );
    await custom!.trigger('click');
    expect(wrapper.emitted('update:cornerRadius')).toContainEqual(['32']);
    await wrapper
      .findAll('.slider-stub')
      .find((slider) => slider.text().toLowerCase().includes('radius'))!
      .trigger('click');
    expect(wrapper.emitted('update:cornerRadius')).toContainEqual(['42']);

    const shadowNone = wrapper.findAll('button').filter((button) => button.text().toLowerCase() === 'none')[1];
    await shadowNone!.trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'none', blur: 40, mode: 'solid', color: '#000000', direction: 'all' },
    ]);
    const shadowSoft = wrapper.findAll('button').find((button) => button.text().toLowerCase() === 'soft');
    await shadowSoft!.trigger('click');
    await wrapper.get('.direction-stub').trigger('click');
    await wrapper.get('.color-stub').trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      { size: 'sm', blur: 40, mode: 'solid', color: '#abcdef', direction: 'top-left' },
    ]);

    const horizBtn = wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase() === 'horizontal' && !button.classes('slider-stub'));
    await horizBtn!.trigger('click');
    expect(wrapper.emitted('update:isMirrored')).toContainEqual([true]);

    const vertBtn = wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase() === 'vertical' && !button.classes('slider-stub'));
    await vertBtn!.trigger('click');
    expect(wrapper.emitted('update:isMirroredY')).toContainEqual([true]);
    await wrapper.get('.frame-stub').trigger('click');
    expect(wrapper.emitted('update:appearance')).toContainEqual([{ borderEnabled: true, frame: 'safari' }]);
    await wrapper.get('.preset-pill').trigger('click');
    expect(wrapper.emitted('update:playbackRate')).toContainEqual([0.5]);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Unlink')!
      .trigger('click');
    expect(wrapper.emitted('unlink')).toHaveLength(1);
  });

  it('normalizes old radius values and renders only applicable control groups', async () => {
    const wrapper = mountPanel(
      clip({ kind: 'audio', cornerRadius: 'full', clipTransform: undefined, isLinked: false }),
    );
    expect(wrapper.find('.section-block').exists()).toBe(false);
    expect(wrapper.find('.preset-pill').exists()).toBe(false);
    expect(wrapper.findAll('.slider-stub')).toHaveLength(0);
    await wrapper.setProps({
      selectedClip: clip({ kind: 'image', cornerRadius: '41px', shadowSize: 'none', clipTransform: undefined }),
    });
    await nextTick();
    expect(wrapper.findAll('.slider-stub')).toHaveLength(1);
    expect(wrapper.find('.direction-stub').exists()).toBe(false);
    expect(wrapper.find('.color-stub').exists()).toBe(false);
  });

  it.each(['screen', 'video', 'image', 'webcam'] as const)(
    'forwards crop preview and commit events for %s',
    async (kind) => {
      const wrapper = mountPanel(clip({ kind }));
      expect(wrapper.find('.accordion-trigger').exists()).toBe(false);
      expect(wrapper.find('.crop-controls-stub').exists()).toBe(true);

      await wrapper.get('.crop-preview').trigger('click');
      await wrapper.get('.crop-update').trigger('click');
      const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
      expect(wrapper.emitted('preview:crop')).toEqual([[crop]]);
      expect(wrapper.emitted('update:crop')).toEqual([[crop]]);
    },
  );

  it('forwards camera settings and formats placement and playback slider values', async () => {
    const wrapper = mountPanel(
      clip({
        kind: 'webcam',
        cameraLayoutPreset: 'floating-bottom-right',
        cameraFramingPreset: 'portrait',
        hasLinkedScreen: true,
        reactToZoom: false,
        playbackRate: 1.25,
        clipTransform: { x: 0.125, y: -0.25, width: 1.5, height: 0.75 },
      }),
    );
    const cameraPanel = wrapper.findComponent(CameraLayoutPanel);
    expect(cameraPanel.props()).toMatchObject({
      layout: 'floating-bottom-right',
      framing: 'portrait',
      hasLinkedScreen: true,
      reactToZoom: false,
      supportsSplitLayouts: true,
    });

    const sliders = wrapper.findAll('.slider-stub');
    expect(sliders[0]!.find('.slider-value').text()).toBe('13%');
    expect(sliders[1]!.find('.slider-value').text()).toBe('-25%');
    expect(sliders[2]!.find('.slider-value').text()).toBe('150%');
    const playbackSlider = sliders.find((slider) =>
      slider.attributes('data-label')?.toLowerCase().includes('playback'),
    );
    expect(playbackSlider).toBeDefined();
    expect(playbackSlider!.find('.slider-value').text()).toBe('1.25×');

    await playbackSlider!.trigger('click');
    expect(wrapper.emitted('update:playbackRate')).toContainEqual([11.25]);

    cameraPanel.vm.$emit('update:framing', 'fit');
    cameraPanel.vm.$emit('update:reactToZoom', true);
    expect(wrapper.emitted('update:cameraFraming')).toContainEqual(['fit']);
    expect(wrapper.emitted('update:reactToZoom')).toContainEqual([true]);
  });

  it.each(['screen', 'video', 'image', 'webcam'] as const)(
    'relays corner-radius interaction state for %s slider drags',
    async (kind) => {
      const wrapper = mountPanel(clip({ kind, cornerRadius: 32 }));
      const radiusSlider = wrapper
        .findAll('.slider-stub')
        .find((slider) => slider.attributes('data-label')?.toLowerCase().includes('radius'));

      expect(radiusSlider).toBeDefined();
      await radiusSlider!.trigger('pointerdown');
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

      await radiusSlider!.trigger('pointerup');
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false]]);
    },
  );

  it('attenuates handles for a radius preset and releases them after the short delay', async () => {
    vi.useFakeTimers();
    const wrapper = mountPanel(clip({ cornerRadius: 'sm' }));
    const mediumPreset = wrapper.findAll('button').find((button) => button.text() === '16px');

    expect(mediumPreset).toBeDefined();
    await mediumPreset!.trigger('click');
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

    vi.runAllTimers();
    await nextTick();
    expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true], [false]]);
  });

  it('clamps placement values and ignores placement events without a transform', async () => {
    const wrapper = mountPanel(clip({ clipTransform: { x: 0, y: 0, width: 3.9, height: 3.9 } }));
    await wrapper.get('.slider-stub').trigger('click');
    expect(wrapper.emitted('update:clipTransform')?.[0]).toEqual([{ x: 0.1, y: 0, width: 3.9, height: 3.9 }]);

    await wrapper.setProps({ selectedClip: clip({ clipTransform: undefined }) });
    await nextTick();
    expect(wrapper.findAll('.slider-stub')).toHaveLength(1);
  });
});
