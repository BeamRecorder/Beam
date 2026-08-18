import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewQualityPopover from '../PreviewQualityPopover.vue';
import type { PreviewPerformanceSnapshot } from '../../performance/preview-performance-types';

const PopoverStub = defineComponent({
  emits: ['toggle'],
  setup(_, { slots }) {
    return () =>
      h('div', { class: 'popover-stub' }, [
        slots.trigger?.({ isOpen: false }),
        slots.default?.({ close: () => undefined }),
      ]);
  },
});

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: ['tooltip', 'tooltipDisabled', 'icon', 'iconOnly'],
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          class: attrs.class,
          'data-tooltip': props.tooltip,
          'data-tooltip-disabled': props.tooltipDisabled ? 'true' : undefined,
          onClick: () => emit('click'),
        },
        [props.icon ? h(props.icon, { class: 'stub-icon' }) : null, slots.icon?.(), slots.default?.()],
      );
  },
});

const BlurRevealTransitionStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'blur-reveal-transition-stub' }, slots.default?.());
  },
});

const snapshot = (status: PreviewPerformanceSnapshot['status'], recommendation: 'half' | 'quarter' | null) =>
  ({
    status,
    scores: { ui: 0.7, worker: 0.2, audio: 0.2, media: 0.2 },
    activity: { playback: true, media: true },
    samples: [],
    issues: ['ui'],
    recommendation,
  }) satisfies PreviewPerformanceSnapshot;

describe('PreviewQualityPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountPopover = (performanceSnapshot: PreviewPerformanceSnapshot) =>
    mount(PreviewQualityPopover, {
      props: { modelValue: 'full', performanceSnapshot },
      global: {
        stubs: {
          Popover: PopoverStub,
          Button: ButtonStub,
          BlurRevealTransition: BlurRevealTransitionStub,
        },
      },
    });

  it('shows one anchored recommendation for three seconds, then leaves only the warning icon state', async () => {
    const wrapper = mountPopover(snapshot('warning', 'half'));

    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(true);
    expect(wrapper.get('.preview-quality-suggestion').text()).toContain('1/2');
    expect(wrapper.get('.preview-quality-trigger').classes()).toContain('is-warning');

    vi.advanceTimersByTime(2_999);
    await nextTick();
    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(true);

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(false);
    expect(wrapper.get('.preview-quality-trigger').classes()).toContain('is-warning');
  });

  it('emits the recommended quality when the suggestion is clicked', async () => {
    const wrapper = mountPopover(snapshot('critical', 'quarter'));

    await wrapper.get('.preview-quality-suggestion button').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['quarter']]);
    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(false);
    expect(wrapper.get('.preview-quality-trigger').classes()).toContain('is-critical');
  });

  it('does not repeat a suggestion after recovery and a later warning', async () => {
    const wrapper = mountPopover(snapshot('warning', 'half'));
    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(true);
    vi.advanceTimersByTime(3_000);
    await nextTick();

    await wrapper.setProps({ performanceSnapshot: snapshot('good', null) });
    await nextTick();
    expect(wrapper.get('.preview-quality-trigger').classes()).not.toContain('is-warning');

    await wrapper.setProps({ performanceSnapshot: snapshot('warning', 'half') });
    await nextTick();
    expect(wrapper.get('.preview-quality-trigger').classes()).toContain('is-warning');
    expect(wrapper.find('.preview-quality-suggestion').exists()).toBe(false);
  });

  it('uses full resolution as the default and exposes only the three proxy options', () => {
    const wrapper = mountPopover(snapshot('good', null));
    const options = wrapper.findAll('.preview-quality-option');

    expect(options).toHaveLength(3);
    expect(options.map((option) => option.text())).toEqual(['1x', '1/2', '1/4']);
    expect(options.map((option) => option.attributes('aria-label'))).toEqual([
      'Full resolution',
      'Half resolution',
      'Quarter resolution',
    ]);
    expect(options[0]?.classes()).toContain('active');
    expect(options[1]?.classes()).not.toContain('active');
    expect(options[2]?.classes()).not.toContain('active');
  });

  it('updates the active option when modelValue prop changes and emits click', async () => {
    const wrapper = mount(PreviewQualityPopover, {
      props: { modelValue: 'half', performanceSnapshot: snapshot('good', null) },
      global: {
        stubs: {
          Popover: PopoverStub,
          Button: ButtonStub,
          BlurRevealTransition: BlurRevealTransitionStub,
        },
      },
    });

    const options = wrapper.findAll('.preview-quality-option');
    expect(options[1]?.classes()).toContain('active');
    expect(options[0]?.classes()).not.toContain('active');

    await options[2]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['quarter']]);
  });
});
