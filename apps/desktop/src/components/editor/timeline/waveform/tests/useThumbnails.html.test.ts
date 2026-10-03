import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, provide, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useThumbnails } from '../useThumbnails';
import { useHtmlThumbnailActivity } from '../useHtmlThumbnailActivity';
import { HTML_THUMBNAIL_ACTIVITY } from '../html-thumbnail-context';
import { htmlPreviewFixture } from '../../../../authoring/html-dom-preview.fixtures';
import type { MediaAsset } from '@beam/engine/shared/composition-types';

const services = vi.hoisted(() => ({
  render: vi.fn(async () => new Blob(['frame'])),
  createUrl: vi.fn(() => 'blob:html'),
  revokeUrl: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../html-thumbnail-services', () => ({ createHtmlThumbnailServices: () => services }));
const wrappers: ReturnType<typeof mount>[] = [];
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await nextTick();
};
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
  vi.useRealTimers();
});
function setup() {
  const playing = ref(true),
    time = ref(0),
    ready = ref(false);
  const source = ref<MediaAsset | null>({
    id: 'html-video',
    kind: 'image',
    name: 'HTML',
    src: 'project-media://html',
    fileName: 'html.png',
    durationMs: 15000,
    width: 1920,
    height: 1080,
    origin: 'project',
    html: htmlPreviewFixture().html,
  });
  let api!: ReturnType<typeof useThumbnails>;
  const Child = defineComponent({
    setup() {
      api = useThumbnails(source);
      return () => null;
    },
  });
  const Parent = defineComponent({
    setup() {
      provide(HTML_THUMBNAIL_ACTIVITY, useHtmlThumbnailActivity(playing, time, ready));
      return () => h(Child);
    },
  });
  wrappers.push(mount(Parent));
  return { api, playing, time, ready, source };
}
describe('editor HTML thumbnail activity binding', () => {
  it('waits for readiness, then continues thumbnails during continuous clock updates', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.api.requestVisibleFrames([1, 2, 3], 480);
    await flush();
    expect(services.render).not.toHaveBeenCalled();
    f.ready.value = true;
    await flush();
    expect(services.render).toHaveBeenLastCalledWith(1000, 240);
    for (let i = 0; i < 10; i++) {
      f.time.value += 0.05;
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(services.render.mock.calls).toEqual([
      [1000, 240],
      [2000, 240],
      [3000, 240],
    ]);
    expect(Object.keys(f.api.thumbnails.value)).toHaveLength(3);
  });
  it('refines cached frames after pause without recreating the worker or clearing artwork', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.ready.value = true;
    f.api.requestVisibleFrames([1], 480);
    await flush();
    f.playing.value = false;
    expect(f.api.thumbnails.value[1]).toBe('blob:html');
    await vi.advanceTimersByTimeAsync(180);
    expect(services.render.mock.calls).toEqual([
      [1000, 240],
      [1000, 480],
    ]);
    expect(f.api.widths.value[1]).toBe(480);
    expect(services.dispose).not.toHaveBeenCalled();
  });
  it('cancels pending paced capture when its source is removed', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.ready.value = true;
    f.api.requestVisibleFrames([1, 2]);
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    f.source.value = null;
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(services.render).toHaveBeenCalledOnce();
    expect(services.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.api.thumbnails.value).toEqual({});
  });
});
