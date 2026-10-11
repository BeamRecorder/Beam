import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPresetPreview from '../EditorPresetPreview.vue';
import { previewSettings } from './preset-preview-fixtures';
import type { MediaFrame } from '@beam/runtime/shared/media-types';

const media = vi.hoisted(() => ({ load: vi.fn(), clear: vi.fn(), paint: vi.fn(), poster: vi.fn() }));
vi.mock('@beam/runtime/screenshot/screenshot-image-loader', () => ({
  createScreenshotImageLoader: () => Object.assign(media.load, { clear: media.clear }),
}));
vi.mock('@beam/runtime/presets/render-preset-preview', () => ({ renderPresetPreview: media.paint }));
vi.mock('@beam/runtime/playback/video-poster', () => ({ decodeVideoPoster: media.poster }));
const image = { naturalWidth: 800, naturalHeight: 600 } as HTMLImageElement;
const video = () => ({
  id: 'sky',
  name: 'Sky',
  path: '/wallpapers/video/wispysky.mp4',
  kind: 'video' as const,
  extension: 'mp4',
});
const poster = (): MediaFrame => ({
  clipId: 'sky',
  bitmap: {} as ImageBitmap,
  width: 480,
  height: 270,
  timestampSeconds: 0,
  durationSeconds: 1,
  byteSize: 100,
  close: vi.fn(),
});
const mounted: Array<{ unmount(): void }> = [];
const show = (settings = previewSettings(), source?: string) => {
  const wrapper = mount(EditorPresetPreview, { props: { settings, source, kind: 'screenshot' } });
  mounted.push(wrapper);
  return wrapper;
};
beforeEach(() => {
  vi.clearAllMocks();
  media.load.mockResolvedValue(image);
  media.poster.mockResolvedValue(poster());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
});
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('preset still preview', () => {
  it('shows a loading state and paints the captured source at a bounded size', async () => {
    const wrapper = show(previewSettings(), 'project-media://image/source.png');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    await flushPromises();
    expect(wrapper.attributes('aria-busy')).toBe('false');
    expect(wrapper.attributes('aria-label')).toBe('Preset preview');
    expect(media.load).toHaveBeenCalledWith('project-media://image/source.png');
    expect(media.paint).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ image: { source: image, width: 800, height: 600 } }),
      360,
      270,
    );
    expect(wrapper.get('canvas').element.style.display).not.toBe('none');
  });

  it('uses the locally bundled reference before a capture exists and releases the image cache', async () => {
    const wrapper = show();
    await flushPromises();
    expect(media.load.mock.calls[0]![0]).toContain('/onboarding/alpine-dawn.webp');
    wrapper.unmount();
    mounted.pop();
    expect(media.clear).toHaveBeenCalledOnce();
  });

  it('loads image backgrounds and the enabled watermark logo', async () => {
    const settings = previewSettings({
      id: 'wall',
      name: 'Wall',
      kind: 'image',
      path: '/wallpapers/image/wallpaper1.webp',
      extension: 'webp',
    });
    settings.editor.presentation!.canvas.watermark!.enabled = true;
    const wrapper = show(settings);
    await flushPromises();
    expect(media.load).toHaveBeenCalledTimes(3);
    expect(media.load.mock.calls[1]![0]).toContain('/wallpapers/image/');
    expect(media.load.mock.calls[2]![0]).toContain('/brand/BeamIcon.webp');
    expect(media.paint.mock.calls[0]![2]).toMatchObject({ background: image, logo: image });
    expect(wrapper.find('.lucide-image-off').exists()).toBe(false);
  });

  it('decodes animated backgrounds once at phase zero and closes their frames', async () => {
    const frame = poster();
    media.poster.mockResolvedValue(frame);
    show(previewSettings(video()));
    await flushPromises();
    expect(media.poster).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', label: 'Wispysky' }), {
      timestampSeconds: 0,
      width: 480,
    });
    expect(media.paint.mock.calls[0]![2].background).toBe(frame.bitmap);
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('ignores disabled background and hidden watermark assets', async () => {
    const settings = previewSettings(video());
    settings.editor.presentation!.canvas.showBackground = false;
    settings.editor.presentation!.canvas.watermark!.enabled = true;
    settings.editor.presentation!.canvas.watermark!.showLogo = false;
    show(settings);
    await flushPromises();
    expect(media.load).toHaveBeenCalledTimes(1);
    expect(media.poster).not.toHaveBeenCalled();
    expect(media.paint.mock.calls[0]![2]).toMatchObject({ background: null, logo: null });
  });

  it.each(['source', 'canvas', 'paint', 'poster'] as const)(
    'exposes an explicit error for %s failures and can recover',
    async (failure) => {
      const settings = previewSettings(failure === 'poster' ? video() : null);
      if (failure === 'source') media.load.mockRejectedValueOnce(new Error('Unreadable image'));
      if (failure === 'canvas') vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
      if (failure === 'paint')
        media.paint.mockImplementationOnce(() => {
          throw new Error('Paint failure');
        });
      if (failure === 'poster') media.poster.mockRejectedValueOnce(new Error('Video unavailable'));
      const wrapper = show(settings);
      await flushPromises();
      expect(wrapper.attributes('aria-label')).toBe('Preview unavailable');
      expect(wrapper.find('.lucide-image-off').exists()).toBe(true);
      expect(wrapper.get('canvas').element.style.display).toBe('none');
      await wrapper.setProps({ source: '/new-source.png' });
      await flushPromises();
      expect(wrapper.attributes('aria-label')).toBe('Preset preview');
      expect(wrapper.get('canvas').element.style.display).not.toBe('none');
    },
  );

  it('ignores old image loads after switching presets', async () => {
    let resolve!: (image: HTMLImageElement) => void;
    media.load.mockReturnValueOnce(
      new Promise<HTMLImageElement>((done) => {
        resolve = done;
      }),
    );
    const wrapper = show();
    await flushPromises();
    await wrapper.setProps({ source: '/new-source.png' });
    await flushPromises();
    expect(media.paint).toHaveBeenCalledOnce();
    resolve(image);
    await flushPromises();
    expect(media.paint).toHaveBeenCalledOnce();
  });

  it('closes an obsolete video poster after disposal without painting it', async () => {
    let resolve!: (frame: MediaFrame) => void;
    media.poster.mockReturnValueOnce(
      new Promise<MediaFrame>((done) => {
        resolve = done;
      }),
    );
    const wrapper = show(previewSettings(video()));
    await flushPromises();
    wrapper.unmount();
    mounted.pop();
    const frame = poster();
    resolve(frame);
    await flushPromises();
    expect(frame.close).toHaveBeenCalledOnce();
    expect(media.paint).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer successful preview with an old error', async () => {
    let reject!: (error: Error) => void;
    media.load.mockReturnValueOnce(
      new Promise<HTMLImageElement>((_done, fail) => {
        reject = fail;
      }),
    );
    const wrapper = show();
    await flushPromises();
    await wrapper.setProps({ source: '/new-source.png' });
    await flushPromises();
    reject(new Error('Old request'));
    await flushPromises();
    expect(wrapper.attributes('aria-label')).toBe('Preset preview');
  });
});
