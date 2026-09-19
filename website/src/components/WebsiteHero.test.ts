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
  it('renders the three-mode hero above the supplied MacBook frame', () => {
    const wrapper = mountHero();
    expect(wrapper.get('.website-hero__copy').text().replaceAll(/\s+/g, ' ')).toContain(
      'Record. Shape. Make it yours.',
    );
    expect(wrapper.get('.hero-announcement').text()).toContain('Screenshot Editor is here');
    expect(wrapper.get('.hero-announcement').attributes('href')).toBe('#editor-demo');
    expect(wrapper.findAll('.hero-modes button').map((button) => button.text())).toEqual([
      'Instant Mode',
      'Studio Mode',
      'Screenshot Mode',
    ]);
    expect(wrapper.get('.macbook-demo__frame').attributes('src')).toBe('/macbook-pro-14-silver.webp');
    expect(wrapper.get('.macbook-demo').find('video').exists()).toBe(true);
    expect(wrapper.find('.macbook-demo__label').exists()).toBe(false);
    expect(wrapper.find('.macbook-demo__status').exists()).toBe(false);
  });

  it('opens the feature explorer in Screenshot mode from the announcement', async () => {
    const wrapper = mountHero();

    await wrapper.get('.hero-announcement').trigger('click');

    expect(wrapper.emitted('update:mode')?.at(-1)).toEqual(['screenshot']);
    expect(wrapper.get('#hero-title').text().replaceAll(/\s+/g, ' ')).toContain('Capture. Mark up. Make it clear.');
  });

  it('switches the hero message without navigating', async () => {
    const wrapper = mountHero();
    const buttons = wrapper.findAll('.hero-modes button');

    expect(buttons[1]!.attributes('aria-pressed')).toBe('true');
    await buttons[0]!.trigger('click');

    expect(wrapper.get('#hero-title').text().replaceAll(/\s+/g, ' ')).toContain('Record. Stop. Already polished.');
    expect(wrapper.get('.mode-message__description').text()).toContain('finished video file lands on your clipboard');
    expect(wrapper.findAll('.hero-modes button')[0]!.attributes('aria-pressed')).toBe('true');
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

  it('uses synchronized foreground and ambient WebM layers with immediate autoplay settings', () => {
    const wrapper = mountHero();
    const videos = wrapper.findAll('video');
    const sources = wrapper.findAll('video source');
    const video = wrapper.get('.macbook-demo__video--primary');

    expect(videos).toHaveLength(2);
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.attributes('src') === '/website-demo.webm')).toBe(true);
    expect(sources.every((source) => source.attributes('type') === 'video/webm')).toBe(true);
    expect(wrapper.get('.macbook-demo__video--ambient').attributes('aria-hidden')).toBe('true');
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
    const video = wrapper.get('.macbook-demo__video--primary');
    const control = wrapper.get('.macbook-demo__control');
    Object.defineProperty(video.element, 'paused', {
      configurable: true,
      get: () => nativePaused,
    });

    expect((video.element as HTMLVideoElement).paused).toBe(true);

    await control.trigger('click');
    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).not.toHaveBeenCalled();
    expect((video.element as HTMLVideoElement).paused).toBe(false);
    await video.trigger('play');
    expect(control.attributes('aria-label')).toBe('Pause demo');

    await control.trigger('click');
    expect(pause).toHaveBeenCalledTimes(2);
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
