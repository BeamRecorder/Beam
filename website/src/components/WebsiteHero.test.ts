import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createWebsiteI18n } from '../i18n';
import WebsiteHero from './WebsiteHero.vue';

const mountHero = () =>
  mount(WebsiteHero, {
    global: {
      plugins: [createWebsiteI18n('en')],
    },
  });

describe('WebsiteHero', () => {
  it('renders the copy on the left and the final WebM video on the right', () => {
    const wrapper = mountHero();
    const columns = wrapper.get('.website-hero').element.children;

    expect(columns).toHaveLength(2);
    expect(columns[0]?.classList.contains('website-hero__copy')).toBe(true);
    expect(columns[1]?.classList.contains('website-hero__media')).toBe(true);
    expect(wrapper.get('.website-hero__copy').text()).toContain('Record. Edit. Share.');
    expect(wrapper.get('.website-hero__media').find('video').exists()).toBe(true);
  });

  it('uses one native WebM source with immediate autoplay settings', () => {
    const wrapper = mountHero();
    const videos = wrapper.findAll('video');
    const sources = wrapper.findAll('video source');
    const video = wrapper.get('video');

    expect(videos).toHaveLength(1);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.attributes('src')).toBe('/website-demo.webm');
    expect(sources[0]!.attributes('type')).toBe('video/webm');
    const videoElement = video.element as HTMLVideoElement;
    expect(videoElement.autoplay).toBe(true);
    expect(videoElement.muted).toBe(true);
    expect(videoElement.loop).toBe(true);
    expect(videoElement.playsInline).toBe(true);
    expect(videoElement.preload).toBe('auto');
  });

  it('lets visitors pause and resume the looping demo', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const wrapper = mountHero();
    const video = wrapper.get('video');
    const control = wrapper.get('.website-hero__video-control');

    await control.trigger('click');
    expect(pause).toHaveBeenCalledOnce();
    await video.trigger('pause');
    expect(control.attributes('aria-label')).toBe('Play demo');

    await control.trigger('click');
    expect(play).toHaveBeenCalledOnce();
    await video.trigger('play');
    expect(control.attributes('aria-label')).toBe('Pause demo');
  });

  it('does not mount the removed editor, cursor, or project-loader pipeline', () => {
    const wrapper = mountHero();

    expect(wrapper.findComponent({ name: 'EditorCanvas' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'WebsiteEditorPreview' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'WebsiteHudPreview' }).exists()).toBe(false);
    expect(wrapper.find('[data-testid="editor-canvas"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-loader"]').exists()).toBe(false);
    expect(wrapper.find('.hero-drag__cursor').exists()).toBe(false);
    expect(wrapper.find('.website-hero__cursor').exists()).toBe(false);
    expect(wrapper.find('.hero-drag__player').exists()).toBe(false);
  });
});
