import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { LayerThumbnail as ThumbnailValue } from '../thumbnail-types';
import LayerThumbnail from '../LayerThumbnail.vue';

const wrappers: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('LayerThumbnail', () => {
  it('keeps the real skeleton until each ready image loads and resets for a replacement revision', async () => {
    const wrapper = mount(LayerThumbnail, {
      props: { value: { status: 'loading', revision: 1 } satisfies ThumbnailValue },
    });
    wrappers.push(wrapper);

    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.thumbnail-skeleton.skeleton').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);

    await wrapper.setProps({ value: { status: 'ready', revision: 1, url: 'blob:first' } });
    const firstImage = wrapper.get('img');
    expect(firstImage.attributes('src')).toBe('blob:first');
    expect(firstImage.attributes('alt')).toBe('');
    expect(firstImage.attributes('draggable')).toBe('false');
    expect(firstImage.classes()).not.toContain('loaded');
    expect(wrapper.find('.thumbnail-skeleton.skeleton').exists()).toBe(true);

    await firstImage.trigger('load');
    expect(firstImage.classes()).toContain('loaded');
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('false');

    await wrapper.setProps({ value: { status: 'ready', revision: 2, url: 'blob:replacement' } });
    const replacement = wrapper.get('img');
    expect(replacement.attributes('src')).toBe('blob:replacement');
    expect(replacement.classes()).not.toContain('loaded');
    expect(wrapper.find('.thumbnail-skeleton.skeleton').exists()).toBe(true);
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('true');

    await replacement.trigger('error');
    expect(wrapper.find('svg[aria-label]').exists()).toBe(true);
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('false');

    await wrapper.setProps({ value: { status: 'ready', revision: 3, url: 'blob:retry' } });
    expect(wrapper.find('svg[aria-label]').exists()).toBe(false);
    expect(wrapper.get('img').attributes('src')).toBe('blob:retry');
    expect(wrapper.find('.thumbnail-skeleton.skeleton').exists()).toBe(true);
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('true');
    await wrapper.get('img').trigger('load');
    expect(wrapper.get('img').classes()).toContain('loaded');
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('false');
  });

  it('shows a worker error directly instead of a skeleton or broken image', () => {
    const wrapper = mount(LayerThumbnail, {
      props: { value: { status: 'error', revision: 4, error: 'thumbnail worker failed' } satisfies ThumbnailValue },
    });
    wrappers.push(wrapper);

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.thumbnail-skeleton').exists()).toBe(false);
    expect(wrapper.find('svg[aria-label]').exists()).toBe(true);
    expect(wrapper.get('svg').attributes('title')).toBe('thumbnail worker failed');
    expect(wrapper.get('.layer-thumbnail').attributes('aria-busy')).toBe('false');
  });
});
