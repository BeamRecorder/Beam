import { defineComponent, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ScreenshotCanvasProps } from '../screenshot-canvas-contract-types';
import { stateFixture } from '../export/tests/export-test-support';
import { screenshotShape } from '../screenshot-state';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import { createScreenshotCursor } from '@beam/runtime/screenshot/screenshot-cursors';
import { BUILTIN_CURSOR_PACKS } from '../../editor/properties/cursor/cursor-packs';
const dependencies = vi.hoisted(() => ({ load: vi.fn(), record: vi.fn() }));
vi.mock('../screenshot-render', () => ({ loadScreenshotAssets: dependencies.load }));
vi.mock('../loading/screenshot-startup-context', () => ({
  injectScreenshotStartup: () => ({ record: dependencies.record }),
}));
import { useScreenshotCanvasAssets } from '../useScreenshotCanvasAssets';

let wrappers: ReturnType<typeof mount>[];
const setup = (changes: Partial<ScreenshotCanvasProps> = {}) => {
  const props = reactive<ScreenshotCanvasProps>({
    source: 'source.png',
    state: stateFixture(),
    selectedId: null,
    selectedIds: [],
    ...changes,
  });
  const paint = vi.fn(),
    fail = vi.fn();
  let resources!: ReturnType<typeof useScreenshotCanvasAssets>;
  const wrapper = mount(
    defineComponent({
      setup() {
        resources = useScreenshotCanvasAssets(props, paint, fail);
        return () => null;
      },
    }),
  );
  wrappers.push(wrapper);
  return { props, paint, fail, resources, wrapper };
};
beforeEach(() => {
  wrappers = [];
  dependencies.record.mockReset();
  dependencies.load
    .mockReset()
    .mockResolvedValue({ width: 1000, height: 500, image: {}, background: null, logo: null });
});
afterEach(() => wrappers.forEach((wrapper) => wrapper.unmount()));
it('retains prepared assets during transforms, opacity changes and unrelated cursor-library completion', async () => {
  const { props, paint } = setup();
  await flushPromises();
  expect(paint).toHaveBeenCalledOnce();
  props.state.image.transform.x = 0.3;
  props.state.canvas.width = 1200;
  props.cursorPacks = [...BUILTIN_CURSOR_PACKS];
  props.cursorPacksReady = true;
  props.state.canvas.watermark!.customText = 'changed';
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledOnce();
});
it('prepares new image and font identities and reports load phases', async () => {
  const { props, resources } = setup();
  await flushPromises();
  props.state.images = [
    { ...props.state.image, kind: 'image', id: 'photo', source: 'photo.png', width: 100, height: 100 },
  ];
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(2);
  const shape = screenshotShape('text', 'text');
  shape.text = { content: 'Text', style: createDefaultCaptionStyle(), padding: 0, verticalAlign: 'center' };
  shape.text!.style.fontAssetId = 'a'.repeat(64);
  props.state.shapes.push(shape);
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(3);
  const callback = dependencies.load.mock.calls[2]![4] as (stage: string, ms: number) => void;
  callback('fonts', 42);
  expect(dependencies.record).toHaveBeenCalledWith('fonts', 42);
  expect(dependencies.record).toHaveBeenCalledWith('assets', expect.any(Number));
  expect(resources.isReady()).toBe(true);
});
it('waits for an unknown imported cursor pack but can load known cursors before library completion', async () => {
  const state = stateFixture(),
    pack = BUILTIN_CURSOR_PACKS[0]!;
  state.cursors = [createScreenshotCursor('cursor', 'Cursor', pack)];
  const { props } = setup({ state, cursorPacks: [], cursorPacksReady: false });
  await flushPromises();
  expect(dependencies.load).not.toHaveBeenCalled();
  props.cursorPacks = [pack];
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledOnce();
  props.state.cursors![0]!.color = '#ff0000';
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(2);
});
it('discards late assets and measurements from an older source and an unmounted canvas', async () => {
  let finish!: (assets: object) => void;
  dependencies.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { props, resources, paint, wrapper } = setup();
  const callback = dependencies.load.mock.calls[0]![4] as (stage: string, ms: number) => void;
  props.source = 'new.png';
  await flushPromises();
  expect(paint).toHaveBeenCalledOnce();
  callback('stale', 20);
  expect(dependencies.record).not.toHaveBeenCalledWith('stale', 20);
  finish({ width: 1, height: 1 });
  await flushPromises();
  expect(resources.assets.value!.width).toBe(1000);
  dependencies.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  props.source = 'last.png';
  await flushPromises();
  wrapper.unmount();
  finish({ width: 2, height: 2 });
  await flushPromises();
  expect(paint).toHaveBeenCalledOnce();
});
it('surfaces current failures but ignores a rejected superseded request', async () => {
  dependencies.load.mockRejectedValueOnce(new Error('missing image'));
  const { props, fail } = setup();
  await flushPromises();
  expect(fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'missing image' }));
  let reject!: (reason: Error) => void;
  dependencies.load.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectJob) => {
        reject = rejectJob;
      }),
  );
  props.source = 'old.png';
  await flushPromises();
  props.source = 'good.png';
  await flushPromises();
  reject(new Error('old'));
  await flushPromises();
  expect(fail).toHaveBeenCalledOnce();
});
it('tracks background, watermark and enabled media identities without fetching disabled layers', async () => {
  const { props } = setup();
  await flushPromises();
  props.state.background = { kind: 'image', id: 'back', name: 'Back', path: 'back.png', extension: 'png' };
  props.state.canvas.showBackground = true;
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(2);
  props.state.background = { kind: 'video', id: 'video', name: 'Video', path: 'video.mp4', extension: 'mp4' };
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(3);
  props.state.canvas.watermark!.enabled = true;
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(4);
  props.state.images = [
    {
      ...props.state.image,
      kind: 'image',
      enabled: false,
      id: 'disabled',
      source: 'disabled.png',
      width: 1,
      height: 1,
    },
  ];
  await flushPromises(); // The absent images list becomes an empty list, then remains stable.
  const count = dependencies.load.mock.calls.length;
  props.state.images![0]!.source = 'other-disabled.png';
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(count);
  props.state.images![0]!.enabled = true;
  await flushPromises();
  expect(dependencies.load).toHaveBeenCalledTimes(count + 1);
});
