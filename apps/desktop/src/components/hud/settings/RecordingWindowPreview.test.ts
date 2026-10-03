import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RecordingWindowPreview from './RecordingWindowPreview.vue';
import RecorderBar from '../recorder/RecorderBar.vue';

describe('instructional recording previews', () => {
  it('reuses the capture cards inside an inert, decorative setup preview', () => {
    const wrapper = mount(RecordingWindowPreview, {
      props: { kind: 'window' },
    });
    expect(wrapper.get('.recording-preview').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.hud-scale').attributes('inert')).toBeDefined();
    expect(wrapper.findAll('.capture-card')).toHaveLength(3);
    expect(wrapper.get('.preview-brand img').attributes('src')).toContain('/brand/BeamIcon.webp');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    expect(wrapper.find('.recorder-bar').exists()).toBe(false);
    wrapper.unmount();
  });
  it('renders the real bar without native dragging or fabricated recording time', () => {
    const wrapper = mount(RecordingWindowPreview, { props: { kind: 'bar' } });
    expect(wrapper.get('.bar-scale').attributes('inert')).toBeDefined();
    expect(wrapper.get('.recorder-bar').classes()).toContain('is-preview');
    expect(wrapper.get('.recording-time').text()).toBe('Ready');
    expect(wrapper.find('.beam-mascot').exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(['auto-fade', 'hover-only'] as const)('demonstrates %s and reveals the bar on hover', async (visibility) => {
    const wrapper = mount(RecordingWindowPreview, {
      props: { kind: 'bar', visibility },
    });
    const bar = wrapper.getComponent(RecorderBar);
    expect(bar.props('visibility')).toBe(visibility);
    await wrapper.get('.recording-preview').trigger('pointerenter');
    expect(bar.props('visibility')).toBe('always');
    await wrapper.get('.recording-preview').trigger('pointerleave');
    expect(bar.props('visibility')).toBe(visibility);
    wrapper.unmount();
  });
});
