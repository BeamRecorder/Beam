import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { ready } = vi.hoisted(() => ({ ready: vi.fn() }));
vi.mock('../../../api/capture', () => ({ capture: { notifyScreenRegionPreviewReady: ready } }));
import RegionSelectionBackdrop from '../region/RegionSelectionBackdrop.vue';

describe('RegionSelectionBackdrop', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const advanceFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };
  const mountBackdrop = () =>
    mount(RegionSelectionBackdrop, { props: { image: 'data:image/png;base64,test', previewId: 7 } });
  beforeEach(() => {
    ready.mockClear();
    frames.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('waits for loading and a painted frame before presenting the native selector', async () => {
    const wrapper = mountBackdrop();
    const image = wrapper.get('img');
    expect(image.attributes()).toMatchObject({ src: 'data:image/png;base64,test', alt: '', draggable: 'false' });
    advanceFrame();
    expect(ready).not.toHaveBeenCalled();
    await image.trigger('load');
    advanceFrame();
    expect(ready).not.toHaveBeenCalled();
    advanceFrame();
    expect(ready).toHaveBeenCalledExactlyOnceWith(7, true);
    await image.trigger('load');
    advanceFrame();
    expect(ready).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('reports image failures once and cancels an in-flight paint', async () => {
    const wrapper = mountBackdrop();
    await wrapper.get('img').trigger('load');
    advanceFrame();
    await wrapper.get('img').trigger('error');
    await wrapper.get('img').trigger('error');
    await wrapper.get('img').trigger('load');
    advanceFrame();
    expect(ready).toHaveBeenCalledExactlyOnceWith(7, false);
    expect(frames.size).toBe(0);
    wrapper.unmount();
  });

  it.each([0, 1])('cancels a stale preview after %s paint frames on disposal', async (count) => {
    const wrapper = mountBackdrop();
    await wrapper.get('img').trigger('load');
    for (let i = 0; i < count; i++) advanceFrame();
    wrapper.unmount();
    advanceFrame();
    expect(ready).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('keeps only the latest loading paint callback', async () => {
    const wrapper = mountBackdrop();
    await wrapper.get('img').trigger('load');
    await wrapper.get('img').trigger('load');
    expect(frames.size).toBe(1);
    advanceFrame();
    advanceFrame();
    expect(ready).toHaveBeenCalledExactlyOnceWith(7, true);
    wrapper.unmount();
  });
});
