import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import type { BackgroundMedia } from '@beam/engine/shared/background-types';
import { useScreenshotBackgroundLibrary } from '../useScreenshotBackgroundLibrary';

const background = (id: string): BackgroundMedia => ({
  id,
  name: id,
  kind: 'image',
  path: `${id}.png`,
  extension: 'png',
});
const setup = () => {
  let change!: () => void;
  const stop = vi.fn(),
    backgrounds = vi.fn<() => Promise<BackgroundMedia[]>>();
  const resources = {
    backgrounds,
    onBackgroundsChanged: (listener: () => void) => {
      change = listener;
      return stop;
    },
  };
  const library = ref<BackgroundMedia[]>([]),
    fail = vi.fn();
  const scope = effectScope();
  scope.run(() => useScreenshotBackgroundLibrary(resources, library, fail));
  return { library, fail, scope, stop, backgrounds, change: () => change() };
};
it('refreshes the active Screenshot library only after a catalogue change', async () => {
  const { backgrounds, library, scope, change } = setup();
  expect(backgrounds).not.toHaveBeenCalled();
  backgrounds.mockResolvedValue([background('new')]);
  change();
  await flushPromises();
  expect(library.value).toEqual([background('new')]);
  scope.stop();
});
it('ignores superseded responses and releases subscriptions on disposal', async () => {
  const { backgrounds, library, scope, change, stop } = setup();
  let finish!: (value: BackgroundMedia[]) => void;
  backgrounds
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([background('latest')]);
  change();
  change();
  await flushPromises();
  finish([background('old')]);
  await flushPromises();
  expect(library.value).toEqual([background('latest')]);
  backgrounds.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  change();
  scope.stop();
  finish([background('closed')]);
  await flushPromises();
  expect(library.value).toEqual([background('latest')]);
  expect(stop).toHaveBeenCalledOnce();
});
it('reports current failures but ignores failures arriving after teardown', async () => {
  const { backgrounds, scope, change, fail } = setup();
  const error = new Error('missing catalogue');
  backgrounds.mockRejectedValue(error);
  change();
  await flushPromises();
  expect(fail).toHaveBeenCalledWith(error);
  let reject!: (reason: unknown) => void;
  backgrounds.mockImplementationOnce(
    () =>
      new Promise((_resolve, no) => {
        reject = no;
      }),
  );
  change();
  scope.stop();
  reject(error);
  await flushPromises();
  expect(fail).toHaveBeenCalledOnce();
});
