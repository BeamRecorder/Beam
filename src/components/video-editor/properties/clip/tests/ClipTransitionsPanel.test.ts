import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Clip } from '~/media/shared/composition-types';
import ClipTransitionsPanel from '../ClipTransitionsPanel.vue';

const BigSlider = {
  props: { modelValue: { type: Number, default: 0 }, max: { type: Number, default: 0 } },
  emits: ['update:modelValue'],
  template:
    '<button class="duration-slider" :class="$attrs.class" :data-max="max" :data-model-value="modelValue" @click="$emit(\'update:modelValue\', max)">Duration</button>',
};

const clip = (kind: Clip['kind'], overrides: Record<string, unknown> = {}) =>
  ({
    id: `${kind}-1`,
    kind,
    name: kind,
    timelineStartMs: 0,
    timelineDurationMs: 2_000,
    sourceInMs: 0,
    sourceDurationMs: 2_000,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    enabled: true,
    order: 0,
    ...overrides,
  }) as Clip;

describe('ClipTransitionsPanel', () => {
  it('offers all visual presets and emits a default-duration entry transition', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: { clip: clip('image') },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.transitions-header').exists()).toBe(false);
    expect(
      wrapper.find('.duration-control').element.compareDocumentPosition(wrapper.get('.preset-gallery').element),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(wrapper.findAll('.preset-card-info strong').map((label) => label.text())).toEqual([
      'None',
      'Fade',
      'Slide left',
      'Slide right',
      'Slide up',
      'Slide down',
      'Zoom in',
      'Zoom out',
      'Blur',
    ]);

    await wrapper.find('.preset-gallery .btn-container:nth-child(2) button').trigger('click');
    expect(wrapper.emitted('update')).toEqual([['entry', { preset: { kind: 'fade' }, durationMs: 500 }]]);
  });

  it('limits audio to None/Fade and keeps the second edge within clip duration', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('audio', {
          timelineDurationMs: 300,
          transitions: { entry: null, exit: { preset: { kind: 'fade' }, durationMs: 100 } },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.findAll('.preset-card-info strong').map((label) => label.text())).toEqual(['None', 'Fade']);
    await wrapper.find('.preset-gallery .btn-container:nth-child(2) button').trigger('click');
    expect(wrapper.emitted('update')).toEqual([['entry', { preset: { kind: 'fade' }, durationMs: 200 }]]);
    await wrapper.setProps({
      clip: clip('audio', {
        timelineDurationMs: 300,
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'fade' }, durationMs: 100 },
        },
      }),
    });
    expect(wrapper.get('.duration-slider').attributes('data-max')).toBe('200');
  });

  it('switches between entry and exit and supports removing a transition', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('video', {
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 300 }, exit: null },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.duration-slider').exists()).toBe(true);
    await wrapper.find('.edge-selector .btn-container:nth-child(2) button').trigger('click');
    expect(wrapper.find('.duration-slider').exists()).toBe(false);
    await wrapper.find('.edge-selector .btn-container:nth-child(1) button').trigger('click');
    await wrapper.find('.preset-gallery .btn-container:nth-child(1) button').trigger('click');
    expect(wrapper.emitted('update')).toContainEqual(['entry', null]);
  });

  it('exposes the visual easing power with a default of three and emits the selected value', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('image', {
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 300 }, exit: null },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    const powerSlider = wrapper.get('.curve-slider');
    expect(powerSlider.attributes('data-model-value')).toBe('3');
    expect(powerSlider.attributes('data-max')).toBe('5');
    await powerSlider.trigger('click');
    expect(wrapper.emitted('update')).toContainEqual([
      'entry',
      { preset: { kind: 'fade' }, durationMs: 300, easingPower: 5 },
    ]);
  });

  it('does not expose visual easing power controls for audio transitions', () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('audio', {
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 300 }, exit: null },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.curve-slider').exists()).toBe(false);
    expect(wrapper.find('.duration-slider').exists()).toBe(true);
  });
});
