import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AudioIconMeter from '../audio/AudioIconMeter.vue';

describe('AudioIconMeter', () => {
  it('renders disabled state correctly', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: false, level: 0, kind: 'mic' },
    });
    expect(wrapper.classes()).not.toContain('enabled');
    expect(wrapper.find('.level-bar-fill').exists()).toBe(false);
  });

  it('renders active level visualization when enabled', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: true, level: 0.5, kind: 'mic' },
    });
    expect(wrapper.classes()).toContain('enabled');
    expect(wrapper.find('.level-bar-fill').exists()).toBe(true);
  });

  it('renders system audio variant when requested', () => {
    const wrapper = mount(AudioIconMeter, {
      props: { enabled: true, level: 0.8, kind: 'system' },
    });
    expect(wrapper.classes()).toContain('enabled');
    expect(wrapper.find('.level-bar-fill').attributes('style')).toContain('height');
  });
});
it.each(['mic', 'system'] as const)('uses a red crossed-out icon for disabled %s, with no live meter', async (kind) => {
  const wrapper = mount(AudioIconMeter, { props: { enabled: false, level: 0.9, kind } });
  expect(wrapper.get('svg').classes()).toContain('is-off');
  const { MicOff, VolumeOff } = await import('@lucide/vue');
  expect(wrapper.findComponent(kind === 'mic' ? MicOff : VolumeOff).exists()).toBe(true);
  expect(wrapper.find('.level-bar-fill').exists()).toBe(false);
  await wrapper.setProps({ enabled: true });
  expect(wrapper.get('svg').classes()).not.toContain('is-off');
  wrapper.unmount();
});
it.each([
  [-1, '10%', 'success'],
  [0, '10%', 'success'],
  [0.4, '40%', 'success'],
  [0.41, '41%', 'warning'],
  [0.75, '75%', 'warning'],
  [0.76, '76%', 'error'],
  [2, '100%', 'error'],
])('retains bounded live levels and peak indication at %s', (level, height, tone) => {
  const wrapper = mount(AudioIconMeter, { props: { enabled: true, level, kind: 'system', size: 'sm' } });
  expect(wrapper.classes()).toContain('size-sm');
  const fill = wrapper.get('.level-bar-fill');
  expect(fill.attributes('style')).toContain(`height: ${height}`);
  expect(fill.attributes('style')).toContain(`--color-${tone}`);
  wrapper.unmount();
});
