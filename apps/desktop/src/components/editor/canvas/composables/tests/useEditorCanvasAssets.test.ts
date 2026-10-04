import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorCanvasAssets } from '../useEditorCanvasAssets';
import { clearEditorImages } from '../../../resources/editor-image-cache';

class TestImage {
  static instances: TestImage[] = [];
  src = '';
  naturalWidth = 32;
  naturalHeight = 32;
  resolve!: () => void;
  reject!: (reason: unknown) => void;
  ready = new Promise<void>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  decode = () => this.ready;
  constructor() {
    TestImage.instances.push(this);
  }
}
const observe = vi.fn(),
  disconnect = vi.fn();
const wrappers: VueWrapper[] = [];
const start = (withContainer = true) => {
  const resize = vi.fn(),
    render = vi.fn();
  let logo!: ReturnType<typeof useEditorCanvasAssets>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const container = ref<HTMLDivElement | null>(null);
        logo = useEditorCanvasAssets(container, resize, render);
        return () => (withContainer ? h('div', { ref: container }) : null);
      },
    }),
  );
  wrappers.push(wrapper);
  return { wrapper, resize, render, logo };
};
beforeEach(() => {
  clearEditorImages();
  TestImage.instances = [];
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal('Image', TestImage);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = observe;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  clearEditorImages();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('reuses the decoded watermark across project canvases and renders when its pixels become ready', async () => {
  const first = start();
  expect(first.resize).toHaveBeenCalledOnce();
  expect(first.render).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledWith(first.wrapper.element);
  TestImage.instances[0]!.resolve();
  await flushPromises();
  expect(first.render).toHaveBeenCalledTimes(2);
  first.wrapper.unmount();
  const second = start();
  await flushPromises();
  expect(second.logo.value).toBe(first.logo.value);
  expect(second.render).toHaveBeenCalledTimes(2);
  expect(TestImage.instances).toHaveLength(1);
  expect(disconnect).toHaveBeenCalledOnce();
});
it('ignores a successful watermark decode after its canvas has unmounted', async () => {
  const canvas = start();
  canvas.wrapper.unmount();
  TestImage.instances[0]!.resolve();
  await flushPromises();
  expect(canvas.render).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledOnce();
});
it('reports a current decode failure and lets a subsequent canvas retry it', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const first = start();
  TestImage.instances[0]!.reject(new Error('broken logo'));
  await flushPromises();
  expect(error).toHaveBeenCalledWith('[Beam media:editor] watermark loading failed.', expect.any(Error));
  expect(first.render).toHaveBeenCalledOnce();
  const second = start();
  expect(TestImage.instances).toHaveLength(2);
  TestImage.instances[1]!.resolve();
  await flushPromises();
  expect(second.render).toHaveBeenCalledTimes(2);
});
it('ignores a failed decode after disposal and tolerates an absent canvas container', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const canvas = start(false);
  expect(observe).not.toHaveBeenCalled();
  canvas.wrapper.unmount();
  TestImage.instances[0]!.reject(new Error('late failure'));
  await flushPromises();
  expect(error).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalledOnce();
});
