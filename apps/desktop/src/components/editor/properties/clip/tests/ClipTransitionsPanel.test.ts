import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import type { PreferencePatch } from '~/api/types/capture-api';
import TransitionPresetPreview from '../TransitionPresetPreview.vue';
import type { Clip } from '@beam/engine/shared/composition-types';
import ClipTransitionsPanel from '../ClipTransitionsPanel.vue';
import Button from '~/ui/button/Button.vue';

const preferences = vi.hoisted(() => ({
  settings: { extras: {} as Record<string, unknown> },
  update: vi.fn(),
}));
vi.mock('~/stores/preferences', () => ({ usePreferencesStore: () => preferences }));
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  preferences.settings.extras = { 'editor.transitionCategory': 'basics' };
  preferences.update.mockReset().mockImplementation(async (patch: PreferencePatch) => {
    Object.assign(preferences.settings.extras, patch.extras);
    return preferences.settings;
  });
});
afterEach(() => vi.unstubAllGlobals());

const categoryIds = ['basics', 'zooms', 'panels', 'shapes', 'color', 'dynamic', 'digital'];
const presetIds = [
  'none',
  'fade',
  'fade-black',
  'fade-white',
  'dip-color',
  'blur',
  'zoom-in',
  'zoom-out',
  'cross-zoom',
  'zoom-bounce',
  'split',
  'push-panels',
  'sliding-panels',
  'circle-reveal',
  'diamond-wipe',
  'linear-wipe',
  'color-fade',
  'gradient-wipe',
  'color-flash',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'whip-pan',
  'push',
  'camera-shake',
  'rgb-split',
  'digital-glitch',
  'pixel-blocks',
];
const card = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-transition-preset="${id}"]`);
const clickCard = async (wrapper: VueWrapper, id: string) => {
  const target = card(wrapper, id);
  await (target.element instanceof HTMLButtonElement ? target : target.get('button')).trigger('click');
};
const category = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-transition-category="${id}"]`);
const openCategory = async (wrapper: VueWrapper, id: string) => {
  const trigger = category(wrapper, id).get('.accordion-trigger');
  if (trigger.attributes('aria-expanded') !== 'true') await trigger.trigger('click');
};

const BigSlider = {
  props: {
    modelValue: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
  },
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
  it.each(['image', 'audio'] as const)(
    'uses compact buttons for all %s transition controls outside thumbnail cards',
    (kind) => {
      const wrapper = mount(ClipTransitionsPanel, { props: { clip: clip(kind) }, global: { stubs: { BigSlider } } });
      const controls = wrapper.findAllComponents(Button).filter((control) => control.props('variant') !== 'card');
      expect(controls.length).toBeGreaterThanOrEqual(3);
      expect(controls.every((control) => control.props('size') === 'xs')).toBe(true);
    },
  );
  it('offers all visual presets and emits a default-duration entry transition', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: { clip: clip('image') },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.transitions-header').exists()).toBe(false);
    expect(wrapper.find('.duration-control').exists()).toBe(false);
    expect(wrapper.get('[data-transition-preset="none"]').classes()).toContain('btn-xs');
    expect(wrapper.get('[data-transition-preset="none"]').classes()).toContain('btn-block');
    expect(wrapper.findAll('.edge-selector button').every((button) => button.classes().includes('btn-xs'))).toBe(true);
    expect(
      wrapper.findAll('[data-transition-category]').map((element) => element.attributes('data-transition-category')),
    ).toEqual(categoryIds);
    expect(
      wrapper
        .findAll('[data-transition-preset]')
        .map((element) => element.attributes('data-transition-preset'))
        .sort(),
    ).toEqual([...presetIds].sort());
    expect(wrapper.findAll('.accordion-inspector')).toHaveLength(7);

    await clickCard(wrapper, 'fade');
    expect(wrapper.emitted('update')).toEqual([
      ['entry', { preset: { kind: 'fade' }, durationMs: 500, easingPower: 3 }],
    ]);
  });

  it('preserves a custom easing power when replacing a visual preset', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('image', {
          transitions: {
            entry: {
              preset: { kind: 'fade' },
              durationMs: 300,
              easingPower: 5,
            },
            exit: null,
          },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    await openCategory(wrapper, 'dynamic');
    await clickCard(wrapper, 'slide-left');

    expect(wrapper.emitted('update')).toContainEqual([
      'entry',
      {
        preset: { kind: 'slide', direction: 'left' },
        durationMs: 300,
        easingPower: 5,
      },
    ]);
  });

  it('limits audio to None/Fade and keeps the second edge within clip duration', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('audio', {
          timelineDurationMs: 300,
          transitions: {
            entry: null,
            exit: { preset: { kind: 'fade' }, durationMs: 100 },
          },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.findAll('[data-transition-category]')).toHaveLength(0);
    expect(
      wrapper.findAll('[data-transition-preset]').map((item) => item.attributes('data-transition-preset')),
    ).toEqual(['none', 'fade']);
    await clickCard(wrapper, 'fade');
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
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 300 },
            exit: null,
          },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.duration-slider').exists()).toBe(true);
    await wrapper.find('.edge-selector .btn-container:nth-child(2) button').trigger('click');
    expect(wrapper.find('.duration-slider').exists()).toBe(false);
    await wrapper.find('.edge-selector .btn-container:nth-child(1) button').trigger('click');
    await clickCard(wrapper, 'none');
    expect(wrapper.emitted('update')).toContainEqual(['entry', null]);
  });

  it('exposes the visual easing power with a default of three and emits the selected value', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('image', {
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 300 },
            exit: null,
          },
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
          transitions: {
            entry: { preset: { kind: 'fade' }, durationMs: 300 },
            exit: null,
          },
        }),
      },
      global: { stubs: { BigSlider } },
    });

    expect(wrapper.find('.curve-slider').exists()).toBe(false);
    expect(wrapper.find('.duration-slider').exists()).toBe(true);
  });
  it('opens one category at a time and keeps None available when every category is closed', async () => {
    const wrapper = mount(ClipTransitionsPanel, { props: { clip: clip('image') }, global: { stubs: { BigSlider } } });
    await openCategory(wrapper, 'zooms');
    expect(category(wrapper, 'basics').get('.accordion-trigger').attributes('aria-expanded')).toBe('false');
    expect(category(wrapper, 'zooms').get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
    await openCategory(wrapper, 'digital');
    expect(category(wrapper, 'zooms').get('.accordion-content').attributes('inert')).toBeDefined();
    expect(category(wrapper, 'digital').get('.accordion-content').attributes('inert')).toBeUndefined();
    await category(wrapper, 'digital').get('.accordion-trigger').trigger('click');
    expect(wrapper.findAll('.accordion.is-open')).toHaveLength(0);
    expect(card(wrapper, 'none').isVisible()).toBe(true);
    expect(wrapper.emitted('update')).toBeUndefined();
    wrapper.unmount();
  });

  it('preserves the opened category through clip and edge changes and when reopening the panel', async () => {
    const wrapper = mount(ClipTransitionsPanel, { props: { clip: clip('video') }, global: { stubs: { BigSlider } } });
    await openCategory(wrapper, 'shapes');
    await flushPromises();
    expect(preferences.update).toHaveBeenCalledWith(
      expect.objectContaining({ extras: expect.objectContaining({ 'editor.transitionCategory': 'shapes' }) }),
    );
    await wrapper.setProps({ clip: clip('image', { id: 'another-image' }), initialEdge: 'exit' });
    expect(category(wrapper, 'shapes').get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
    const reopened = mount(ClipTransitionsPanel, { props: { clip: clip('image') }, global: { stubs: { BigSlider } } });
    expect(category(reopened, 'shapes').get('.accordion-trigger').attributes('aria-expanded')).toBe('true');
    reopened.unmount();
  });

  it('animates only a hovered or selected preview in the open category', async () => {
    const wrapper = mount(ClipTransitionsPanel, {
      props: {
        clip: clip('video', {
          transitions: { entry: { preset: { kind: 'zoom', direction: 'in' }, durationMs: 300 }, exit: null },
        }),
      },
      global: { stubs: { BigSlider } },
    });
    const preview = (id: string) => card(wrapper, id).findComponent(TransitionPresetPreview);
    await openCategory(wrapper, 'zooms');
    expect(preview('zoom-in').props('active')).toBe(true);
    await card(wrapper, 'zoom-out').trigger('mouseenter');
    expect(preview('zoom-out').props('active')).toBe(true);
    await card(wrapper, 'zoom-out').trigger('mouseleave');
    expect(preview('zoom-out').props('active')).toBe(false);
    await openCategory(wrapper, 'dynamic');
    expect(preview('zoom-in').props('active')).toBe(false);
    await card(wrapper, 'slide-left').trigger('focus');
    expect(preview('slide-left').props('active')).toBe(true);
    await card(wrapper, 'slide-left').trigger('blur');
    expect(preview('slide-left').props('active')).toBe(false);
    wrapper.unmount();
  });
});
