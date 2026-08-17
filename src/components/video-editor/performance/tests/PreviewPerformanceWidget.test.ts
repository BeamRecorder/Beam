import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PreviewPerformanceWidget from '../PreviewPerformanceWidget.vue';
import type { PreviewPerformanceSnapshot } from '../preview-performance-types';

type SnapshotWithMedia = PreviewPerformanceSnapshot & {
  scores: PreviewPerformanceSnapshot['scores'] & { media: number };
  samples: Array<PreviewPerformanceSnapshot['samples'][number] & { media: number }>;
};

const TooltipStub = defineComponent({
  props: { content: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h('div', { class: 'tooltip-stub', 'data-tooltip': props.content }, [
        slots.default?.(),
        h('div', { class: 'tooltip-content-stub' }, slots.content?.()),
      ]);
  },
});

const GraphStub = defineComponent({
  props: {
    values: { type: Array, default: () => [] },
    color: { type: String, default: '' },
    label: { type: String, default: '' },
    width: { type: Number, default: 82 },
    height: { type: Number, default: 20 },
  },
  setup(props) {
    return () =>
      h('canvas', {
        class: 'graph-stub',
        'aria-label': props.label,
        'data-values': JSON.stringify(props.values),
        'data-color': props.color,
        'data-width': String(props.width),
        'data-height': String(props.height),
      });
  },
});

const BlurRevealTransitionStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'blur-reveal-transition-stub' }, slots.default?.());
  },
});

const snapshot = (
  status: PreviewPerformanceSnapshot['status'] = 'good',
  scores: PreviewPerformanceSnapshot['scores'] = { ui: 0.12, worker: 0.42, audio: 0.74, media: 0.3 },
  activity: PreviewPerformanceSnapshot['activity'] = { playback: true, media: true },
): PreviewPerformanceSnapshot => ({
  status,
  scores: { ...scores, media: scores.media ?? 0.3 } as SnapshotWithMedia['scores'],
  activity,
  samples: [
    { timestampMs: 100, ui: 0.12, worker: 0.42, audio: 0.74, media: 0.3 },
    { timestampMs: 600, ui: 0.25, worker: 0.48, audio: 0.6, media: 0.35 },
  ],
  issues: ['audio'],
  recommendation: null,
});

describe('PreviewPerformanceWidget', () => {
  const mountWidget = (value = snapshot()) =>
    mount(PreviewPerformanceWidget, {
      props: { snapshot: value },
      global: {
        stubs: {
          Tooltip: TooltipStub,
          MiniPerformanceGraph: GraphStub,
          BlurRevealTransition: BlurRevealTransitionStub,
        },
      },
    });

  it('keeps the monitor visible while playback is idle', () => {
    const wrapper = mountWidget(snapshot('idle'));

    expect(wrapper.find('.performance-widget').exists()).toBe(true);
    expect(wrapper.find('.blur-reveal-transition-stub').exists()).toBe(true);
  });

  it('keeps the UI detail visible when playback and media activity are inactive', () => {
    const wrapper = mountWidget(snapshot('idle', undefined, { playback: false, media: false }));
    const graphs = wrapper.findAll('.graph-stub');

    expect(graphs).toHaveLength(2);
    expect(wrapper.text()).toContain('UI');
    expect(wrapper.text()).not.toContain('Playback');
    expect(wrapper.text()).not.toContain('Media');
  });

  it('shows only the playback detail while playback activity is active', () => {
    const wrapper = mountWidget(snapshot('good', undefined, { playback: true, media: false }));
    const graphs = wrapper.findAll('.graph-stub');

    expect(graphs).toHaveLength(3);
    expect(wrapper.text()).toContain('Playback');
    expect(wrapper.text()).not.toContain('Media');
  });

  it('shows only the media detail while media activity is active', () => {
    const wrapper = mountWidget(snapshot('good', undefined, { playback: false, media: true }));
    const graphs = wrapper.findAll('.graph-stub');

    expect(graphs).toHaveLength(3);
    expect(wrapper.text()).not.toContain('Playback');
    expect(wrapper.text()).toContain('Media');
  });

  it.each(['good', 'warning', 'critical'] as const)('is visible during %s playback', async (status) => {
    const wrapper = mountWidget(snapshot(status));

    await wrapper.vm.$nextTick();
    expect(wrapper.find('.performance-widget').exists()).toBe(true);
  });

  it('passes a global max curve to the compact graph', () => {
    const wrapper = mountWidget();
    const graph = wrapper.findAll('.graph-stub')[0]!;

    expect(JSON.parse(graph.attributes('data-values') ?? '[]')).toEqual([0.74, 0.6]);
    expect(graph.attributes('data-color')).toBe('var(--color-warning)');
    expect(graph.attributes('data-width')).toBe('96');
    expect(graph.attributes('data-height')).toBe('28');
    expect(wrapper.find('.performance-status-dot').exists()).toBe(false);
  });

  it('keeps UI, combined playback and media curves in the hover details', () => {
    const wrapper = mountWidget();
    const graphs = wrapper.findAll('.graph-stub');

    expect(graphs).toHaveLength(4);
    expect(graphs.slice(1).map((graph) => graph.attributes('data-width'))).toEqual(['96', '96', '96']);
    expect(graphs.slice(1).map((graph) => graph.attributes('data-color'))).toEqual([
      'var(--color-success)',
      'var(--color-warning)',
      'var(--color-success)',
    ]);
    expect(JSON.parse(graphs[1]!.attributes('data-values') ?? '[]')).toEqual([0.12, 0.25]);
    expect(JSON.parse(graphs[2]!.attributes('data-values') ?? '[]')).toEqual([0.74, 0.6]);
    expect(JSON.parse(graphs[3]!.attributes('data-values') ?? '[]')).toEqual([0.3, 0.35]);
    expect(wrapper.findAll('.performance-detail-row b')).toHaveLength(0);
    expect(wrapper.find('.performance-state-wash').exists()).toBe(false);
  });

  it('uses healthy success colors for every detail when all current scores are below the threshold', () => {
    const wrapper = mountWidget(snapshot('good', { ui: 0.2, worker: 0.3, audio: 0.4, media: 0.25 }));
    const graphs = wrapper.findAll('.graph-stub');

    expect(graphs.slice(1).map((graph) => graph.attributes('data-color'))).toEqual([
      'var(--color-success)',
      'var(--color-success)',
      'var(--color-success)',
    ]);
  });

  it.each([
    ['good', { ui: 0.4, worker: 0.4, audio: 0.4, media: 0.4 }, 'var(--color-success)', 'is-good'],
    ['warning', { ui: 0.6, worker: 0.2, audio: 0.2, media: 0.2 }, 'var(--color-warning)', 'is-high'],
    ['critical', { ui: 0.8, worker: 0.2, audio: 0.2, media: 0.2 }, 'var(--color-error)', 'is-critical'],
  ] as const)('uses the instant score threshold for %s graph color', (status, scores, color, levelClass) => {
    const wrapper = mountWidget(snapshot('good', scores));

    expect(wrapper.get('.graph-stub').attributes('data-color')).toBe(color);
    expect(wrapper.get('.performance-widget').classes()).toContain(levelClass);
  });

  it('animates the current label and color when the instant level changes', async () => {
    const wrapper = mountWidget(snapshot('good', { ui: 0.4, worker: 0.2, audio: 0.2, media: 0.2 }));
    expect(wrapper.get('.performance-widget').classes()).toContain('is-good');
    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).toContain('UI, OK');

    await wrapper.setProps({ snapshot: snapshot('good', { ui: 0.6, worker: 0.2, audio: 0.2, media: 0.2 }) });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.performance-widget').classes()).toContain('is-high');
    expect(wrapper.get('.graph-stub').attributes('data-color')).toBe('var(--color-warning)');
    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).toContain('UI, High');
  });

  it('keeps the graph and hover details accessible without exposing percentages', () => {
    const wrapper = mountWidget();

    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).toContain('Performance');
    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).toContain('UI, OK');
    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).toContain('Playback, High');
    expect(wrapper.get('.tooltip-stub').attributes('data-tooltip')).not.toContain('%');
    expect(wrapper.findAll('.tooltip-stub').map((tooltip) => tooltip.attributes('data-tooltip'))).toContain(
      'Higher curve means more load',
    );
    expect(wrapper.get('.tooltip-content-stub').text()).not.toContain('%');
    expect(wrapper.findAll('.performance-detail-row b')).toHaveLength(0);
    expect(wrapper.findAll('.graph-stub')[0]!.attributes('aria-label')).toContain('UI, OK');
  });

  it('uses the generic info button tooltip for the curve explanation', () => {
    const wrapper = mountWidget();

    expect(wrapper.get('.performance-details strong').text()).toBe('Performance');
    expect(wrapper.get('.performance-details .tooltip-stub').attributes('data-tooltip')).toBe(
      'Higher curve means more load',
    );
  });
});
