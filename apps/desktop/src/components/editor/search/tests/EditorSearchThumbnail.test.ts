import { mount, enableAutoUnmount } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Film } from '@lucide/vue';
import type { MediaAsset, ShapeClip, ColorClip } from '@beam/engine/shared/composition-types';
import EditorSearchThumbnail from '../EditorSearchThumbnail.vue';
const data = vi.hoisted(() => ({
  request: vi.fn(),
  error: null as string | null,
}));
vi.mock('../../timeline/waveform/useThumbnails', () => ({
  useThumbnails: () => ({
    requestVisibleFrames: data.request,
    thumbnails: ref({ 1: 'blob:frame' }),
    error: ref(data.error),
  }),
}));
enableAutoUnmount(afterEach);
afterEach(() => {
  data.error = null;
  data.request.mockClear();
});
describe('Spotlight real clip previews', () => {
  it('loads images once and shows an explicit error when decoding fails', async () => {
    const wrapper = mount(EditorSearchThumbnail, {
      props: { preview: { kind: 'image', src: 'project-media:image' } },
    });
    expect(wrapper.get('.search-thumbnail').attributes('aria-busy')).toBe('true');
    await wrapper.get('img').trigger('load');
    expect(wrapper.get('.search-thumbnail').attributes('aria-busy')).toBe('false');
    await wrapper.setProps({
      preview: { kind: 'image', src: 'project-media:bad' },
    });
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('.search-thumbnail').attributes('aria-busy')).toBe('false');
  });
  it('requests only a visible video row through the shared timeline source and uses its source time', async () => {
    const asset = {
      id: 'video',
      src: 'project-media:video',
      kind: 'video',
    } as MediaAsset;
    const wrapper = mount(EditorSearchThumbnail, {
      props: { preview: { kind: 'video', asset, timeSec: 1 } },
    });
    expect(data.request).toHaveBeenCalledWith([1], 240);
    expect(wrapper.get('img').attributes('src')).toBe('blob:frame');
    await wrapper.setProps({ preview: { kind: 'video', asset, timeSec: 2 } });
    expect(data.request).toHaveBeenLastCalledWith([2], 240);
    expect(wrapper.find('img').exists()).toBe(false);
  });
  it('uses one compact shape or screenshot preview and never repeats timeline artwork across the row', () => {
    const shape = mount(EditorSearchThumbnail, {
      props: { preview: { kind: 'shape', clip: { id: 'shape' } as ShapeClip } },
      global: { stubs: { ShapeTimelinePreview: true } },
    });
    expect(shape.findComponent({ name: 'ShapeTimelinePreview' }).props('presentation')).toBe('thumbnail');
    const layer = mount(EditorSearchThumbnail, {
      props: {
        preview: { kind: 'layer', value: { status: 'loading', revision: 1 } },
      },
      global: { stubs: { LayerThumbnail: true } },
    });
    expect(layer.findComponent({ name: 'LayerThumbnail' }).props('value')).toMatchObject({
      status: 'loading',
    });
    const icon = mount(EditorSearchThumbnail, { props: { icon: Film } });
    expect(icon.find('svg').exists()).toBe(true);
    const empty = mount(EditorSearchThumbnail);
    expect(empty.find('svg').exists()).toBe(false);
  });
  it('renders a real color fill inside the bounded thumbnail', () => {
    const wrapper = mount(EditorSearchThumbnail, {
      props: {
        preview: {
          kind: 'color',
          clip: { fill: { kind: 'color', color: '#ffcc00' } } as ColorClip,
        },
      },
    });
    expect(wrapper.get('.search-thumbnail .color-preview').attributes('style')).toContain('rgb(255, 204, 0)');
  });
  it('represents video decoding failure without a fabricated thumbnail', () => {
    data.error = 'Cannot decode';
    const asset = { id: 'video', src: 'bad' } as MediaAsset;
    const wrapper = mount(EditorSearchThumbnail, {
      props: { preview: { kind: 'video', asset, timeSec: 0 } },
    });
    expect(wrapper.get('.search-thumbnail').attributes('aria-busy')).toBe('false');
    expect(wrapper.find('svg').exists()).toBe(true);
  });
});
