import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createWebsiteI18n } from '../i18n';
import { demoMedia } from '../demo/website-demo-fixture';
import WebsiteHeroDrag from './WebsiteHeroDrag.vue';

const mountHero = () =>
  mount(WebsiteHeroDrag, {
    global: {
      plugins: [createWebsiteI18n('en')],
    },
  });

describe('WebsiteHeroDrag', () => {
  it('renders the marketing copy on the left and media on the right', async () => {
    const wrapper = mountHero();
    await nextTick();

    expect(wrapper.get('#hero-title').text()).toBe('Record. Edit. Share.');
    expect(wrapper.text()).toContain('Download Beam — Free');

    const columns = wrapper.findAll('.hero-drag > div');
    expect(columns[0]!.classes()).toContain('hero-drag__copy');
    expect(columns[1]!.classes()).toContain('hero-drag__media');
  });

  it('falls back to the webm player when WebCodecs playback is unavailable', async () => {
    const wrapper = mountHero();
    await nextTick();

    const video = wrapper.get('.hero-drag__player video');
    expect(video.attributes('src')).toBe(demoMedia.heroVideoUrl);
    expect(video.attributes('loop')).toBeDefined();
    expect((video.element as HTMLVideoElement).muted).toBe(true);
  });

  it('keeps the entrance cursor hidden until playback starts', async () => {
    const wrapper = mountHero();
    await nextTick();

    expect(wrapper.find('.hero-drag__cursor').exists()).toBe(false);
  });

  it('emits explore when the demo button is clicked', async () => {
    const wrapper = mountHero();

    await wrapper.get('.hero-drag__explore').trigger('click');
    expect(wrapper.emitted('explore')).toHaveLength(1);
  });
});
