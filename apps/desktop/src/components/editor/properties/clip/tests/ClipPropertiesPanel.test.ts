import { triggerPointer } from '../../../../../../../../tests/support/pointer';
import { defineComponent, h, nextTick, type PropType } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClipPropertiesPanel from '../ClipPropertiesPanel.vue';
import CameraLayoutPanel from '../../camera/CameraLayoutPanel.vue';
import Input from '~/ui/input/Input.vue';
import TransformControls from '../../shared/TransformControls.vue';

const BigSliderStub = defineComponent({
  name: 'BigSlider',
  props: {
    modelValue: { type: Number, default: 0 },
    label: { type: String, default: '' },
    formatValue: {
      type: Function as PropType<(value: number) => string>,
      default: undefined,
    },
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
    return () =>
      h(
        'button',
        {
          class: 'color-stub',
          onClick: () => emit('update:modelValue', '#abcdef'),
        },
        'color',
      );
  },
});

const ShadowDirectionStub = defineComponent({
  name: 'ShadowDirectionGroup',
  emits: ['update:modelValue'],
  setup(_, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'direction-stub',
          onClick: () => emit('update:modelValue', 'top-left'),
        },
        'direction',
      );
  },
});

const FrameStub = defineComponent({
  name: 'BorderAndFrameControls',
  emits: ['update'],
  setup(_, { emit }) {
    return () =>
      h(
        'button',
        {
          class: 'frame-stub',
          onClick: () => emit('update', { borderEnabled: true, frame: 'safari' }),
        },
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

const mountPanel = (selectedClip: ReturnType<typeof clip> | null = clip(), includeSidecars = false) =>
  mount(ClipPropertiesPanel, {
    props: { selectedClip, canvasSize: { width: 1920, height: 1080 } },
    slots: includeSidecars ? { sidecars: () => h('button', { class: 'sidecar-slot' }, 'Sidecars') } : undefined,
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
  it.each(['video', 'image'])('keeps the %s placement reset inside its expanded controls', async (kind) => {
    const wrapper = mountPanel(clip({ kind }));
    const placement = wrapper.get('[data-clip-section="placement"]');
    const trigger = placement.get('.accordion-trigger');
    const reset = placement.get('[aria-label="Reset clip placement"]');
    expect(placement.get('.accordion-heading').find('[aria-label="Reset clip placement"]').exists()).toBe(false);
    expect(placement.find('.accordion-actions').exists()).toBe(false);
    expect(reset.text()).toBe('Reset');
    expect(reset.element.closest('.accordion-content')).toBe(placement.get('.accordion-content').element);
    expect(reset.isVisible()).toBe(true);
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(placement.get('.accordion-content').attributes('inert')).toBeDefined();
    await trigger.trigger('click');
    await reset.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('reset:clipTransform')).toEqual([[]]);
    expect(wrapper.emitted('update:clipTransform')).toBeUndefined();
    wrapper.unmount();
  });
  it('opens placement and collapses secondary sections without modifying the document', async () => {
    const wrapper = mountPanel();
    for (const section of ['placement', 'layout', 'crop', 'radius', 'shadow', 'speed']) {
      expect(wrapper.get(`[data-clip-section="${section}"] .accordion-trigger`).attributes('aria-expanded')).toBe(
        String(section === 'placement'),
      );
      if (section !== 'crop') {
        const trigger = wrapper.get(`[data-clip-section="${section}"] .accordion-trigger`);
        await trigger.trigger('click');
        await trigger.trigger('click');
      }
    }
    const cropTrigger = wrapper.get('[data-clip-section="crop"] .accordion-trigger');
    await cropTrigger.trigger('click');
    await wrapper.setProps({ selectedClip: clip({ id: 'clip-2' }) });
    expect(cropTrigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('update:crop')).toBeUndefined();
    expect(wrapper.emitted('update:clipTransform')).toBeUndefined();
  });

  it('hides manual placement for split camera layouts and preserves the independent mirror controls', async () => {
    const wrapper = mountPanel(clip({ kind: 'webcam', cameraLayoutPreset: 'split-left' }));
    expect(wrapper.findComponent(TransformControls).exists()).toBe(false);
    const mirror = wrapper.get('[data-clip-section="mirroring"]');
    await mirror.get('.accordion-trigger').trigger('click');
    await mirror.get('[aria-label="Mirror horizontally"]').trigger('click');
    await mirror.get('[aria-label="Mirror vertically"]').trigger('click');
    expect(wrapper.emitted('update:isMirrored')).toEqual([[true]]);
    expect(wrapper.emitted('update:isMirroredY')).toEqual([[true]]);
  });

  it('keeps all layout operations connected inside the collapsed layout section', () => {
    const wrapper = mountPanel();
    const layout = wrapper.findComponent(CameraLayoutPanel);
    layout.vm.$emit('update:layout', 'center');
    layout.vm.$emit('update:split-ratio', 0.7);
    layout.vm.$emit('update:split-padding', 12);
    expect(wrapper.emitted('update:cameraLayout')).toEqual([['center']]);
    expect(wrapper.emitted('update:cameraSplitRatio')).toEqual([[0.7]]);
    expect(wrapper.emitted('update:cameraSplitPadding')).toEqual([[12]]);
  });

  it('removes screenshot crop and layout disclosures while retaining the reusable placement controls', async () => {
    const wrapper = mountPanel(clip({ kind: 'image' }));
    await wrapper.setProps({ hideLayout: true, hideCrop: true });
    expect(wrapper.find('[data-clip-section="layout"]').exists()).toBe(false);
    expect(wrapper.find('[data-clip-section="crop"]').exists()).toBe(false);
    expect(wrapper.find('[data-clip-section="speed"]').exists()).toBe(false);
    expect(wrapper.findComponent(TransformControls).exists()).toBe(true);
  });

  it('hides screenshot layout while preserving placement, appearance, shadows, borders and mirroring', async () => {
    const wrapper = mountPanel(clip({ kind: 'image', isLinked: false }));
    await wrapper.setProps({ hideLayout: true });
    expect(wrapper.findComponent({ name: 'CameraLayoutPanel' }).exists()).toBe(false);
    expect(wrapper.find('.frame-stub').exists()).toBe(true);
    expect(wrapper.findComponent(ShadowDirectionStub).exists()).toBe(true);
    expect(wrapper.findComponent(TransformControls).findAll('input')).toHaveLength(5);
    expect(wrapper.text()).not.toContain('Playback Speed');
    await wrapper.get('.frame-stub').trigger('click');
    expect(wrapper.emitted('update:appearance')).toEqual([[{ borderEnabled: true, frame: 'safari' }]]);
    wrapper.unmount();
  });

  it('renders the empty state when no clip is selected', () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.text()).toContain('No clip selected');
  });

  it('updates placement, radius, shadow, mirror, frame, speed and destructive actions', async () => {
    const wrapper = mountPanel(clip(), true);
    expect(wrapper.findAll('.slider-stub')).toHaveLength(1);
    const placementInputs = wrapper.findComponent(TransformControls).findAllComponents(Input);
    placementInputs[0]!.vm.$emit('update:modelValue', 10);
    placementInputs[1]!.vm.$emit('update:modelValue', 10);
    placementInputs[3]!.vm.$emit('update:modelValue', 2112);
    expect(wrapper.emitted('update:clipTransform')).toEqual([
      [{ x: 0.1, y: 0, width: 1, height: 0.5 }],
      [{ x: 0, y: 0.1, width: 1, height: 0.5 }],
      [{ x: 0, y: 0, width: 1.1, height: 0.55 }],
    ]);

    await wrapper.get('[aria-label="Reset clip placement"]').trigger('click');
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
      {
        size: 'none',
        blur: 40,
        mode: 'solid',
        color: '#000000',
        direction: 'all',
      },
    ]);
    const shadowSoft = wrapper.findAll('button').find((button) => button.text().toLowerCase() === 'soft');
    await shadowSoft!.trigger('click');
    await wrapper.get('.direction-stub').trigger('click');
    await wrapper.get('.color-stub').trigger('click');
    expect(wrapper.emitted('update:shadow')).toContainEqual([
      {
        size: 'sm',
        blur: 40,
        mode: 'solid',
        color: '#abcdef',
        direction: 'top-left',
      },
    ]);

    await wrapper.get('[aria-label="Mirror horizontally"]').trigger('click');
    expect(wrapper.emitted('update:isMirrored')).toContainEqual([true]);

    await wrapper.get('[aria-label="Mirror vertically"]').trigger('click');
    await wrapper.get('[aria-label="Rotate 90° left"]').trigger('click');
    await wrapper.get('[aria-label="Rotate 90° right"]').trigger('click');
    expect(wrapper.emitted('update:rotation')).toEqual([[270], [90]]);
    expect(wrapper.emitted('update:isMirroredY')).toContainEqual([true]);
    await wrapper.get('.frame-stub').trigger('click');
    expect(wrapper.emitted('update:appearance')).toContainEqual([{ borderEnabled: true, frame: 'safari' }]);
    await wrapper.get('.preset-pill').trigger('click');
    expect(wrapper.emitted('update:playbackRate')).toContainEqual([0.5]);

    expect(wrapper.get('.sidecar-slot').text()).toBe('Sidecars');
  });

  it('normalizes old radius values and renders only applicable control groups', async () => {
    const wrapper = mountPanel(
      clip({
        kind: 'audio',
        cornerRadius: 'full',
        clipTransform: undefined,
        isLinked: false,
      }),
    );
    expect(wrapper.find('.section-block').exists()).toBe(false);
    expect(wrapper.find('.preset-pill').exists()).toBe(false);
    expect(wrapper.findAll('.slider-stub')).toHaveLength(0);
    await wrapper.setProps({
      selectedClip: clip({
        kind: 'image',
        cornerRadius: '41px',
        shadowSize: 'none',
        clipTransform: undefined,
      }),
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
      const cropSection = wrapper.get('[data-clip-section="crop"]');
      expect(cropSection.get('.accordion-trigger').attributes('aria-expanded')).toBe('false');
      await cropSection.get('.accordion-trigger').trigger('click');
      expect(cropSection.get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
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
    expect(
      wrapper
        .findComponent(TransformControls)
        .findAll('input')
        .map((input) => input.element.value),
    ).toEqual(['12.5', '-25', '0', '2880', '810']);
    expect(cameraPanel.props('hideHeading')).toBe(true);
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
      await triggerPointer(radiusSlider!, 'pointerdown');
      expect(wrapper.emitted('corner-radius-interaction')).toEqual([[true]]);

      await triggerPointer(radiusSlider!, 'pointerup');
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

  it('bounds placement edits and removes placement controls when the clip has no transform', async () => {
    const wrapper = mountPanel(clip({ clipTransform: { x: 0, y: 0, width: 3.9, height: 3.9 } }));
    wrapper.findComponent(TransformControls).findAllComponents(Input)[0]!.vm.$emit('update:modelValue', 900);
    expect(wrapper.emitted('update:clipTransform')?.[0]).toEqual([{ x: 3, y: 0, width: 3.9, height: 3.9 }]);

    await wrapper.setProps({
      selectedClip: clip({ clipTransform: undefined }),
    });
    await nextTick();
    expect(wrapper.findAll('.slider-stub')).toHaveLength(1);
    expect(wrapper.findComponent(TransformControls).exists()).toBe(false);
  });
});
