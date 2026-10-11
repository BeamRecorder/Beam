import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorAmbientBackground from '../EditorAmbientBackground.vue';
import type { BackgroundMedia, BackgroundValue } from '@beam/engine/shared/background-types';
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

vi.mock('@beam/runtime/playback/index', () => ({
  decodeVideoPoster: runtime.decodeVideoPoster,
}));
vi.mock('@beam/runtime/shared/index', () => ({
  mediaSourceDescriptor: runtime.mediaSourceDescriptor,
}));

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

const image = (): BackgroundMedia => ({
  id: '/wallpapers/image/test.webp',
  name: 'Test image',
  path: '/wallpapers/image/test.webp',
  extension: 'webp',
  kind: 'image',
});

const video = (): BackgroundMedia => ({
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
    const wrapper = mount(EditorAmbientBackground, {
      props: { background: null },
    });
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

  it.each([color(), gradient(), image()])(
    'keeps the selected $kind background in the shared ambient surface',
    (background) => {
      const wrapper = mount(EditorAmbientBackground, { props: { background } });
      expect(wrapper.classes()).not.toContain('is-workspace-background');
      expect(wrapper.attributes('aria-hidden')).toBe('true');
      expect(wrapper.find('.ambient-surface, .ambient-media').exists()).toBe(true);
      expect(wrapper.props('background')).toEqual(background);
      wrapper.unmount();
    },
  );

  it('keeps the subdued ambient appearance when the source changes', async () => {
    const background = image();
    const wrapper = mount(EditorAmbientBackground, { props: { background } });
    expect(wrapper.classes()).not.toContain('is-workspace-background');
    expect(wrapper.get('img').attributes('src')).toBe(resolvePublicAssetUrl(background.path));
    await wrapper.setProps({ background: null });
    expect(wrapper.find('.ambient-media').exists()).toBe(false);
    expect(wrapper.find('.ambient-veil').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders color and gradient backgrounds without introducing a grid', async () => {
    const wrapper = mount(EditorAmbientBackground, {
      props: { background: color() },
    });
    const root = wrapper.get('.editor-ambient-background');

    expect(root.get('.ambient-surface').attributes('style')).toMatch(/#112233|rgb\(17, 34, 51\)/i);
    expect(root.find('.ambient-veil').exists()).toBe(true);
    expect(root.find('.canvas-3x3-grid').exists()).toBe(false);
    expect(root.find('[class*="grid"]').exists()).toBe(false);

    await wrapper.setProps({ background: gradient() });
    expect(wrapper.get('.ambient-surface').attributes('style')).toMatch(/linear-gradient/i);
    expect(wrapper.get('.ambient-surface').attributes('style')).toContain('rgba(255, 90, 31, 0.8)');
  });

  it('renders a radial gradient with bounded stop transparency', () => {
    const background = gradient() as Extract<BackgroundValue, { kind: 'gradient' }>;
    background.gradient.type = 'radial';
    background.gradient.stops[0]!.alpha = -1;
    background.gradient.stops[1]!.alpha = 2;
    const wrapper = mount(EditorAmbientBackground, { props: { background } });
    const style = wrapper.get('.ambient-surface').attributes('style');
    expect(style).toContain('radial-gradient');
    expect(style).toContain('rgba(16, 24, 32, 0)');
    expect(style).toContain('rgb(255, 90, 31)');
    wrapper.unmount();
  });

  it('resolves image paths and keeps the image layer non-interactive', () => {
    const wrapper = mount(EditorAmbientBackground, {
      props: { background: image() },
    });
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
      expect.objectContaining({
        id: background.id,
        kind: 'video',
        src: resolvePublicAssetUrl(background.path),
      }),
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
    const wrapper = mount(EditorAmbientBackground, {
      props: { background: video() },
    });
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

  it('releases a late video poster after the workspace background changes', async () => {
    const frame = posterFrame();
    let resolve!: (value: typeof frame) => void;
    runtime.decodeVideoPoster.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const background = { ...video(), fileName: 'wallpaper.webm' };
    const wrapper = mount(EditorAmbientBackground, { props: { background } });
    await flushPromises();
    expect(runtime.mediaSourceDescriptor).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: 'wallpaper.webm' }),
    );
    await wrapper.setProps({ background: image() });
    resolve(frame);
    await flushPromises();
    expect(frame.close).toHaveBeenCalledOnce();
    expect(wrapper.find('canvas').exists()).toBe(false);
    expect(wrapper.get('img').attributes('src')).toBe(resolvePublicAssetUrl('/wallpapers/image/test.webp'));
    wrapper.unmount();
  });

  it('ignores a late video decoding error after choosing a valid image', async () => {
    let reject!: (reason: Error) => void;
    runtime.decodeVideoPoster.mockReturnValueOnce(new Promise((_resolve, fail) => (reject = fail)));
    const wrapper = mount(EditorAmbientBackground, { props: { background: video() } });
    await flushPromises();
    await wrapper.setProps({ background: image() });
    reject(new Error('Old video decode failed'));
    await flushPromises();
    expect(wrapper.find('img').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not decode a video replaced before its runtime module loads', async () => {
    runtime.decodeVideoPoster.mockClear();
    const wrapper = mount(EditorAmbientBackground, { props: { background: video() } });
    await wrapper.setProps({ background: color() });
    await flushPromises();
    expect(runtime.decodeVideoPoster).not.toHaveBeenCalled();
    expect(wrapper.find('canvas').exists()).toBe(false);
    wrapper.unmount();
  });

  it('releases the decoded poster when the 2D drawing context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const frame = posterFrame();
    runtime.decodeVideoPoster.mockResolvedValueOnce(frame);
    const wrapper = mount(EditorAmbientBackground, { props: { background: video() } });
    await flushPromises();
    expect(wrapper.find('canvas').exists()).toBe(true);
    wrapper.unmount();
    expect(frame.close).toHaveBeenCalledOnce();
  });
});
