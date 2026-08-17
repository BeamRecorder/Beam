import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CameraLayoutPanel from './CameraLayoutPanel.vue';

const baseProps = {
  layout: 'custom' as const,
  framing: 'custom' as const,
  hasLinkedScreen: true,
  splitRatio: 0.5,
  splitPadding: 0,
};

describe('CameraLayoutPanel', () => {
  it('renders the ten camera layouts and seven framing presets', () => {
    const wrapper = mount(CameraLayoutPanel, { props: baseProps });

    expect(wrapper.findAll('button.layout-button')).toHaveLength(10);
    expect(wrapper.findAll('.layout-preview')).toHaveLength(10);
    expect(wrapper.findAll('.btn-group button')).toHaveLength(7);
  });

  it('disables every split layout and explains why when no screen is linked', async () => {
    const wrapper = mount(CameraLayoutPanel, {
      props: { ...baseProps, hasLinkedScreen: false },
    });
    const layoutButtons = wrapper.findAll('button.layout-button');

    expect(layoutButtons).toHaveLength(10);
    expect(layoutButtons.slice(0, 6).every((button) => !button.attributes('disabled'))).toBe(true);
    expect(layoutButtons.slice(6).every((button) => button.attributes('disabled') !== undefined)).toBe(true);
    expect(wrapper.text()).toContain('No matching screen recording is available at this point in the timeline.');

    await layoutButtons[6]!.trigger('click');
    expect(wrapper.emitted('update:layout') ?? []).toHaveLength(0);
  });

  it('emits floating and split layouts together with framing changes', async () => {
    const wrapper = mount(CameraLayoutPanel, {
      props: { ...baseProps, layout: 'floating-bottom-right', framing: 'fit' },
    });
    const layoutButtons = wrapper.findAll('button.layout-button');
    const framingButtons = wrapper.findAll('.btn-group button');

    await layoutButtons[0]!.trigger('click');
    await layoutButtons[9]!.trigger('click');
    await framingButtons[0]!.trigger('click');
    await framingButtons[6]!.trigger('click');

    expect(wrapper.emitted('update:layout')).toEqual([['floating-top-left'], ['split-bottom']]);
    expect(wrapper.emitted('update:framing')).toEqual([['fill'], ['circle']]);
  });

  it('shows and emits the camera share only for split layouts', async () => {
    const wrapper = mount(CameraLayoutPanel, { props: { ...baseProps, layout: 'split-left', splitRatio: 0.5 } });
    const sliders = wrapper.findAll('input[type="range"]');
    expect(sliders).toHaveLength(2);
    await sliders[0]!.setValue('65');
    await sliders[1]!.setValue('4');
    expect(wrapper.emitted('update:splitRatio')).toEqual([[0.65]]);
    expect(wrapper.emitted('update:splitPadding')).toEqual([[0.04]]);

    await wrapper.setProps({ layout: 'floating-top-left' });
    expect(wrapper.find('input[type="range"]').exists()).toBe(false);
  });
});
