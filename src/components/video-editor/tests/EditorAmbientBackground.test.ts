import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorAmbientBackground from '../EditorAmbientBackground.vue';
import type { BackgroundValue } from '../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const color = (value = '#112233'): BackgroundValue => ({
  id: `color:${value}`,
  name: value,
  kind: 'color',
  color: value,
});

const gradient = (): BackgroundValue => ({
  id: 'gradient:test',
  name: 'Test gradient',
  kind: 'gradient',
  gradient: {
    type: 'linear',
    angle: 135,
    stops: [
      { id: 'start', position: 0, color: '#101820', alpha: 1 },
      { id: 'end', position: 1, color: '#ff5a1f', alpha: 0.8 },
    ],
  },
});

const image = (): BackgroundValue => ({
  id: '/wallpapers/image/test.webp',
  name: 'Test image',
  path: '/wallpapers/image/test.webp',
  extension: 'webp',
  kind: 'image',
});

const video = (): BackgroundValue => ({
  id: '/wallpapers/video/test.mp4',
  name: 'Test video',
  path: '/wallpapers/video/test.mp4',
  extension: 'mp4',
  kind: 'video',
});

describe('EditorAmbientBackground', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders an inert fallback surface when no background is selected', () => {
    const wrapper = mount(EditorAmbientBackground, { props: { background: null } });
    const root = wrapper.get('.editor-ambient-background');

    expect(root.attributes('aria-hidden')).toBe('true');
    expect(root.find('.ambient-veil').exists()).toBe(true);
    expect(root.find('.ambient-media').exists()).toBe(false);
    expect(root.find('.ambient-surface').exists()).toBe(false);
    expect(root.find('img').exists()).toBe(false);
    expect(root.find('video').exists()).toBe(false);
    expect(root.findAll('button, a, input, select, textarea')).toHaveLength(0);
  });

  it('renders color and gradient backgrounds without introducing a grid', async () => {
    const wrapper = mount(EditorAmbientBackground, { props: { background: color() } });
    const root = wrapper.get('.editor-ambient-background');

    expect(root.get('.ambient-surface').attributes('style')).toMatch(/#112233|rgb\(17, 34, 51\)/i);
    expect(root.find('.ambient-veil').exists()).toBe(true);
    expect(root.find('.canvas-3x3-grid').exists()).toBe(false);
    expect(root.find('[class*="grid"]').exists()).toBe(false);

    await wrapper.setProps({ background: gradient() });
    expect(wrapper.get('.ambient-surface').attributes('style')).toMatch(/linear-gradient/i);
    expect(wrapper.get('.ambient-surface').attributes('style')).toContain('#ff5a1fcc');
  });

  it('resolves image paths and keeps the image layer non-interactive', () => {
    const wrapper = mount(EditorAmbientBackground, { props: { background: image() } });
    const imageElement = wrapper.get('img');
    const root = wrapper.get('.editor-ambient-background');

    expect(imageElement.attributes('src')).toBe(resolvePublicAssetUrl('/wallpapers/image/test.webp'));
    expect(imageElement.attributes('aria-hidden')).toBe('true');
    expect(root.find('.ambient-media').exists()).toBe(true);
  });

  it('uses a muted, inline video frame without ever animating it', () => {
    const wrapper = mount(EditorAmbientBackground, { props: { background: video() } });
    const videoElement = wrapper.get('video').element as HTMLVideoElement;

    expect(videoElement.src).toBe(resolvePublicAssetUrl('/wallpapers/video/test.mp4'));
    expect(videoElement.muted).toBe(true);
    expect(videoElement.playsInline).toBe(true);
    expect(videoElement.autoplay).toBe(false);
    expect(videoElement.loop).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(videoElement.paused).toBe(true);
  });

  it('shows the fallback when an image or video reports an error', async () => {
    const wrapper = mount(EditorAmbientBackground, { props: { background: image() } });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('.ambient-media').exists()).toBe(false);
    expect(wrapper.find('.ambient-veil').exists()).toBe(true);

    await wrapper.setProps({ background: video() });
    await wrapper.get('video').trigger('error');
    expect(wrapper.find('.ambient-media').exists()).toBe(false);
    expect(wrapper.find('.ambient-veil').exists()).toBe(true);
  });
});
