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

    const title = wrapper.get('#hero-title');
    expect(title.text()).toBe('Record. Edit. Share.');
    expect(title.findAll('.hero-title__punctuation').map((part) => part.text())).toEqual(['.', '.', '.']);
    expect(wrapper.find('.hero-eyebrow').exists()).toBe(false);
    expect(wrapper.get('.hero-availability').text()).toContain('Free on every desktop.');
    expect(wrapper.get('.hero-availability').text()).toContain('Available for Windows, macOS, and Linux.');
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

  it('does not render the removed explore action or emit its event', async () => {
    const wrapper = mountHero();
    await nextTick();

    expect(wrapper.find('.hero-drag__explore').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('See Beam in action');
    expect(wrapper.text()).not.toContain('Explore the editor');
    expect(wrapper.emitted('explore')).toBeUndefined();
  });
});
