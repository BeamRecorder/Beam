import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createWebsiteI18n } from '../i18n';
import WebsiteHero from './WebsiteHero.vue';
import Button from '~/ui/button/Button.vue';
import { detectPlatform } from '@website/lib/platform-downloads';

const mountHero = () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  return mount(WebsiteHero, {
    global: {
      plugins: [createWebsiteI18n('en'), router],
    },
  });
};

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

  it('uses the shared Button with the detected platform icon', () => {
    const wrapper = mountHero();
    const installButton = wrapper.getComponent(Button).get<HTMLAnchorElement>('a');

    expect(installButton.classes()).toContain('btn-primary');
    expect(installButton.attributes('href')).toMatch(/^\/install\?os=(?:windows|macos|linux)$/);
    expect(installButton.text()).toBe('Download Beam — Free');
    expect(installButton.find('.platform-icon').exists()).toBe(true);
    expect(wrapper.find('.hero-primary-action').exists()).toBe(false);
  });

  it('navigates the Download Beam CTA to the detected installer', () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [],
    });
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined);
    const wrapper = mount(WebsiteHero, {
      global: {
        plugins: [createWebsiteI18n('en'), router],
      },
    });
    const installButton = wrapper.getComponent(Button).get<HTMLAnchorElement>('a');
    const platform = detectPlatform(navigator);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    expect(installButton.element.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith({
      path: '/install',
      query: platform ? { os: platform } : {},
    });
    expect(installButton.attributes('href')).toBe(platform ? `/install?os=${platform}` : '/install');
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
    let nativePaused = true;
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
      nativePaused = true;
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {
      nativePaused = false;
    });
    const wrapper = mountHero();
    const video = wrapper.get('video');
    const control = wrapper.get('.website-hero__video-control');
    Object.defineProperty(video.element, 'paused', {
      configurable: true,
      get: () => nativePaused,
    });

    expect((video.element as HTMLVideoElement).paused).toBe(true);

    await control.trigger('click');
    expect(play).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
    expect((video.element as HTMLVideoElement).paused).toBe(false);
    await video.trigger('play');
    expect(control.attributes('aria-label')).toBe('Pause demo');

    await control.trigger('click');
    expect(pause).toHaveBeenCalledOnce();
    expect((video.element as HTMLVideoElement).paused).toBe(true);
    await video.trigger('pause');
    expect(control.attributes('aria-label')).toBe('Play demo');
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
