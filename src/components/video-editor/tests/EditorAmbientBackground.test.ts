import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorAmbientBackground from '../EditorAmbientBackground.vue';
import type { BackgroundMedia, BackgroundValue } from '../composables/backgroundCatalog';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const runtime = vi.hoisted(() => ({
  decodeVideoPoster: vi.fn(),
  mediaSourceDescriptor: vi.fn((asset: { id: string; src: string; name: string }) => ({
    assetId: asset.id,
    kind: 'video',
    url: asset.src,
    label: asset.name,
  })),
}));

vi.mock('~/media/playback', () => ({ decodeVideoPoster: runtime.decodeVideoPoster }));
vi.mock('~/media/shared', () => ({ mediaSourceDescriptor: runtime.mediaSourceDescriptor }));

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

const posterFrame = () => ({
  bitmap: {} as CanvasImageSource,
  width: 640,
  height: 360,
  close: vi.fn(),
});

describe('EditorAmbientBackground', () => {
  beforeEach(() => {
    runtime.decodeVideoPoster.mockResolvedValue(posterFrame());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
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
    expect(root.find('canvas').exists()).toBe(false);
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

  it('renders a decoded video poster on canvas without creating or animating HTML video', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    const background = video() as BackgroundMedia;
    const wrapper = mount(EditorAmbientBackground, { props: { background } });
    await flushPromises();

    const canvas = wrapper.get('canvas').element as HTMLCanvasElement;
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(runtime.mediaSourceDescriptor).toHaveBeenCalledWith(
      expect.objectContaining({ id: background.id, kind: 'video', src: resolvePublicAssetUrl(background.path) }),
    );
    expect(runtime.decodeVideoPoster).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: background.id, kind: 'video' }),
      { position: 0.5, width: 640 },
    );
    expect(createElement.mock.calls.some(([tag]) => tag.toLowerCase() === 'video')).toBe(false);
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('shows the fallback when poster decoding fails and closes stale frames', async () => {
    const firstFrame = posterFrame();
    runtime.decodeVideoPoster.mockResolvedValueOnce(firstFrame);
    const wrapper = mount(EditorAmbientBackground, { props: { background: video() } });
    await flushPromises();
    await wrapper.setProps({ background: color() });
    expect(firstFrame.close).toHaveBeenCalledOnce();

    runtime.decodeVideoPoster.mockRejectedValueOnce(new Error('decode failed'));
    await wrapper.setProps({ background: video() });
    await flushPromises();
    expect(wrapper.find('.ambient-media').exists()).toBe(false);
    expect(wrapper.find('.ambient-veil').exists()).toBe(true);

    await wrapper.setProps({ background: image() });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('.ambient-media').exists()).toBe(false);
    expect(wrapper.find('.ambient-veil').exists()).toBe(true);
  });
});
