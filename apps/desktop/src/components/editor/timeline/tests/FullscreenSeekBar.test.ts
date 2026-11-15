import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FullscreenSeekBar from '../FullscreenSeekBar.vue';
import Slider from '~/ui/slider/Slider.vue';

const render = (props = {}) => mount(FullscreenSeekBar, { props: { currentTime: 12.5, duration: 120, ...props } });
describe('fullscreen preview seek bar', () => {
  it('uses the accessible shared native range and follows playback position', async () => {
    const wrapper = render();
    const input = wrapper.get('input');
    expect(input.attributes()).toMatchObject({
      type: 'range',
      min: '0',
      max: '120',
      step: '0.01',
      'aria-label': 'Seek in preview',
      'aria-valuetext': '00:12 / 02:00',
    });
    expect((input.element as HTMLInputElement).value).toBe('12.5');
    expect(wrapper.find('.slider-value').exists()).toBe(false);
    await wrapper.setProps({ currentTime: 65 });
    expect((input.element as HTMLInputElement).value).toBe('65');
    expect(input.attributes('aria-valuetext')).toBe('01:05 / 02:00');
  });
  it('scrubs live and commits an exact seek on release without changing playback intent', async () => {
    const wrapper = render();
    const input = wrapper.get('input');
    (input.element as HTMLInputElement).value = '42.75';
    await input.trigger('input');
    expect(wrapper.emitted('seek')).toEqual([[42.75, 'scrub']]);
    await input.trigger('change');
    expect(wrapper.emitted('seek')).toEqual([
      [42.75, 'scrub'],
      [42.75, 'seek'],
    ]);
    expect(wrapper.emitted('update:isPlaying')).toBeUndefined();
  });
  it.each([0, -1, NaN, Infinity])('disables seeking for an unavailable duration %s', (duration) => {
    const wrapper = render({ duration });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    wrapper.findComponent(Slider).vm.$emit('update:modelValue', 10);
    wrapper.findComponent(Slider).vm.$emit('commit', 10);
    expect(wrapper.emitted('seek')).toBeUndefined();
  });
  it('disables seeking during preview loading and re-enables it when ready', async () => {
    const wrapper = render({ loading: true });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    wrapper.findComponent(Slider).vm.$emit('commit', 10);
    expect(wrapper.emitted('seek')).toBeUndefined();
    await wrapper.setProps({ loading: false });
    expect(wrapper.get('input').attributes('disabled')).toBeUndefined();
    await wrapper.get('input').setValue('10');
    expect(wrapper.emitted('seek')).toContainEqual([10, 'seek']);
  });
  it.each([-10, NaN, Infinity, 130])('keeps the displayed time within the current duration: %s', (currentTime) => {
    const wrapper = render({ currentTime });
    expect(wrapper.findComponent(Slider).props('modelValue')).toBe(currentTime === 130 ? 120 : 0);
  });
  it('clamps out-of-range seeks and ignores invalid updates', () => {
    const wrapper = render();
    const slider = wrapper.findComponent(Slider);
    slider.vm.$emit('update:modelValue', -1);
    slider.vm.$emit('commit', 500);
    slider.vm.$emit('update:modelValue', NaN);
    expect(wrapper.emitted('seek')).toEqual([
      [0, 'scrub'],
      [120, 'seek'],
    ]);
  });
});
