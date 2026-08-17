import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PreviewPerformanceWarning from '../PreviewPerformanceWarning.vue';
import type { PreviewPerformanceSnapshot } from '../preview-performance-types';

const snapshot = (
  status: PreviewPerformanceSnapshot['status'],
  recommendation: PreviewPerformanceSnapshot['recommendation'],
): PreviewPerformanceSnapshot => ({
  status,
  scores: { ui: 0.8, worker: 0.1, audio: 0.1 },
  samples: [],
  issues: ['ui'],
  recommendation,
});

describe('PreviewPerformanceWarning', () => {
  it('stays hidden for idle and healthy preview playback', () => {
    for (const status of ['idle', 'good'] as const) {
      const wrapper = mount(PreviewPerformanceWarning, { props: { snapshot: snapshot(status, null) } });
      expect(wrapper.find('.performance-warning').exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it('shows an accessible warning and offers half quality first', async () => {
    const wrapper = mount(PreviewPerformanceWarning, {
      props: { snapshot: snapshot('warning', 'half') },
    });

    expect(wrapper.get('.performance-warning').attributes('role')).toBe('status');
    expect(wrapper.get('.performance-warning').attributes('aria-live')).toBe('polite');
    expect(wrapper.text()).toContain('Preview may stutter.');
    expect(wrapper.text()).toContain('Switch to 1/2');

    await wrapper.get('.performance-warning button').trigger('click');
    expect(wrapper.emitted('select-quality')).toEqual([['half']]);
  });

  it('offers quarter quality after half quality remains critical', async () => {
    const wrapper = mount(PreviewPerformanceWarning, {
      props: { snapshot: snapshot('critical', 'quarter') },
    });

    expect(wrapper.text()).toContain('Preview performance is still limited.');
    expect(wrapper.text()).toContain('Switch to 1/4');
    await wrapper.get('.performance-warning button').trigger('click');
    expect(wrapper.emitted('select-quality')).toEqual([['quarter']]);
  });

  it('does not render a dead action at the lowest preview quality', () => {
    const wrapper = mount(PreviewPerformanceWarning, {
      props: { snapshot: snapshot('critical', null) },
    });

    expect(wrapper.get('.performance-warning').exists()).toBe(true);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Switch to');
  });
});
