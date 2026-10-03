import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProjectPreviewImage from './ProjectPreviewImage.vue';

describe('project preview image', () => {
  it('keeps a real loading surface until decoding completes, then reveals the image', async () => {
    const wrapper = mount(ProjectPreviewImage, { props: { src: 'image://one', alt: 'Preview' } });
    expect(wrapper.find('.preview-skeleton').exists()).toBe(true);
    expect(wrapper.get('img').classes()).not.toContain('is-ready');
    expect(wrapper.get('img').attributes('decoding')).toBe('async');
    await wrapper.get('img').trigger('load');
    expect(wrapper.find('.preview-skeleton').exists()).toBe(false);
    expect(wrapper.get('img').classes()).toContain('is-ready');
    wrapper.unmount();
  });
  it('resets loading on a replaced source without reusing the old image', async () => {
    const wrapper = mount(ProjectPreviewImage, { props: { src: 'image://one', alt: 'Preview' } });
    const old = wrapper.get('img').element;
    await wrapper.get('img').trigger('load');
    await wrapper.setProps({ src: 'image://two' });
    expect(wrapper.find('.preview-skeleton').exists()).toBe(true);
    expect(wrapper.get('img').element).not.toBe(old);
    expect(wrapper.get('img').classes()).not.toContain('is-ready');
    wrapper.unmount();
  });
  it('leaves missing previews loading and exposes failed images through their translated alternative text', async () => {
    const wrapper = mount(ProjectPreviewImage, { props: { src: null, alt: 'Aperçu' } });
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.setProps({ src: 'image://broken' });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('.preview-skeleton').exists()).toBe(false);
    expect(wrapper.get('img').attributes('alt')).toBe('Aperçu');
    await wrapper.setProps({ src: null });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.preview-skeleton').exists()).toBe(true);
    wrapper.unmount();
  });
});
