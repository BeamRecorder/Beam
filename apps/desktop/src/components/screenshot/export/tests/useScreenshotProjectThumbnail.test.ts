import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stateFixture } from './export-test-support';
import { documentFixture } from '../../tests/screenshot-editor-test-helpers';
import type { ScreenshotThumbnailHost } from '../screenshot-thumbnail-types';
const dependencies = vi.hoisted(() => ({ encode: vi.fn(), persist: vi.fn(), digest: vi.fn() }));
vi.mock('../screenshot-export', () => ({ encodeScreenshot: dependencies.encode }));
vi.mock('~/api/capture', () => ({ capture: { saveScreenshotThumbnail: dependencies.persist } }));
import { useScreenshotProjectThumbnail } from '../useScreenshotProjectThumbnail';

let wrappers: ReturnType<typeof mount>[];
const setup = () => {
  const blocked = ref(false);
  const host: ScreenshotThumbnailHost = {
    document: ref(documentFixture()),
    state: ref(stateFixture()),
    blocked: () => blocked.value,
    save: vi.fn(async () => {}),
  };
  let thumbnail!: ReturnType<typeof useScreenshotProjectThumbnail>;
  const wrapper = mount(
    defineComponent({
      setup() {
        thumbnail = useScreenshotProjectThumbnail(host);
        return () => null;
      },
    }),
  );
  wrappers.push(wrapper);
  return { host, blocked, wrapper, flush: () => thumbnail.flush() };
};
const settle = async () => {
  await vi.advanceTimersByTimeAsync(1_000);
  await flushPromises();
};
beforeEach(() => {
  wrappers = [];
  vi.useFakeTimers();
  dependencies.encode.mockReset().mockResolvedValue(new ArrayBuffer(4));
  dependencies.persist.mockReset().mockResolvedValue('project-media://screenshot/id/thumbnail.webp?v=1');
  dependencies.digest.mockReset().mockResolvedValue(new Uint8Array(32).fill(1).buffer);
  vi.stubGlobal('crypto', { subtle: { digest: dependencies.digest } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('renders the complete opened composition at thumbnail size without changing document settings', async () => {
  const { host } = setup();
  const original = JSON.parse(JSON.stringify(host.state.value));
  await vi.advanceTimersByTimeAsync(999);
  expect(dependencies.encode).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await flushPromises();
  expect(dependencies.encode).toHaveBeenCalledWith(
    host.document.value!.source,
    { ...original, format: 'webp', quality: 0.8 },
    expect.objectContaining({ outputSize: { width: 480, height: 240 }, signal: expect.any(AbortSignal) }),
  );
  expect(host.state.value).toEqual(original);
  expect(dependencies.persist).toHaveBeenCalledWith(host.document.value!.id, {
    bytes: new ArrayBuffer(4),
    stateHash: '01'.repeat(32),
  });
  expect(dependencies.digest.mock.calls[0]![0]).toBe('SHA-256');
});
it('coalesces repeated edits and persists only the final snapshot after saving', async () => {
  const { host } = setup();
  for (let index = 0; index < 5; index++) {
    host.state.value!.quality = index / 10;
    await vi.advanceTimersByTimeAsync(200);
  }
  expect(dependencies.encode).not.toHaveBeenCalled();
  let save!: () => void;
  vi.mocked(host.save).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        save = resolve;
      }),
  );
  await settle();
  expect(dependencies.encode).toHaveBeenCalledOnce();
  expect(dependencies.persist).not.toHaveBeenCalled();
  save();
  await flushPromises();
  expect(dependencies.persist).toHaveBeenCalledOnce();
});
it('defers during a gesture or export and resumes after the editor becomes idle', async () => {
  const { blocked } = setup();
  blocked.value = true;
  await settle();
  expect(dependencies.encode).not.toHaveBeenCalled();
  blocked.value = false;
  await settle();
  expect(dependencies.persist).toHaveBeenCalledOnce();
});
it('discards a late render after edits and renders the newer snapshot', async () => {
  const { host } = setup();
  let finish!: (bytes: ArrayBuffer) => void;
  dependencies.encode.mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  await settle();
  const signal = dependencies.encode.mock.calls[0]![2].signal as AbortSignal;
  host.state.value!.quality = 0.7;
  expect(signal.aborted).toBe(true);
  // The superseded job can finish late; the new timer must not lose the queued update.
  await settle();
  expect(dependencies.encode).toHaveBeenCalledOnce();
  finish(new ArrayBuffer(2));
  await flushPromises();
  expect(dependencies.encode).toHaveBeenCalledTimes(2);
  expect(dependencies.persist).toHaveBeenCalledOnce();
});
it('defers a queued replacement if interaction begins before the previous job finishes', async () => {
  const { host, blocked } = setup();
  let finish!: (bytes: ArrayBuffer) => void;
  dependencies.encode.mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  await settle();
  host.state.value!.quality = 0.7;
  await settle();
  blocked.value = true;
  finish(new ArrayBuffer(2));
  await flushPromises();
  expect(dependencies.encode).toHaveBeenCalledOnce();
  expect(dependencies.persist).not.toHaveBeenCalled();
  blocked.value = false;
  await settle();
  expect(dependencies.encode).toHaveBeenCalledTimes(2);
  expect(dependencies.persist).toHaveBeenCalledOnce();
});
it('flushes pending edits before navigation and skips a previously saved identical composition', async () => {
  const { host, flush, blocked } = setup();
  blocked.value = true;
  await flush();
  expect(dependencies.persist).toHaveBeenCalledOnce();
  await flush();
  expect(dependencies.encode).toHaveBeenCalledOnce();
  host.state.value!.quality = 0.6;
  await flush();
  expect(dependencies.persist).toHaveBeenCalledTimes(2);
});
it('waits for an active job before flushing the newest state', async () => {
  const { flush } = setup();
  let finish!: (bytes: ArrayBuffer) => void;
  dependencies.encode.mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  await settle();
  const pending = flush();
  finish(new ArrayBuffer(3));
  await pending;
  expect(dependencies.encode).toHaveBeenCalledOnce();
});
it.each(['save', 'encode', 'digest', 'persist'] as const)(
  'keeps the editor usable after a %s failure and allows retry',
  async (phase) => {
    const { host, flush } = setup();
    const reason = new Error('unavailable');
    if (phase === 'save') vi.mocked(host.save).mockRejectedValueOnce(reason);
    else dependencies[phase].mockRejectedValueOnce(reason);
    await flush();
    expect(console.warn).toHaveBeenCalledWith('Screenshot project thumbnail update failed.', reason);
    await flush();
    expect(dependencies.persist).toHaveBeenCalled();
  },
);
it('does not cache a stale result rejected by storage', async () => {
  const { flush } = setup();
  dependencies.persist.mockResolvedValueOnce(null);
  await flush();
  await flush();
  expect(dependencies.encode).toHaveBeenCalledTimes(2);
});
it('does not render missing projects or state and cancels work on disposal', async () => {
  const { host, flush, wrapper } = setup();
  host.document.value = null;
  await settle();
  await flush();
  expect(dependencies.encode).not.toHaveBeenCalled();
  host.document.value = documentFixture();
  host.state.value = null;
  await settle();
  await flush();
  expect(dependencies.encode).not.toHaveBeenCalled();
  host.state.value = stateFixture();
  let finish!: (bytes: ArrayBuffer) => void;
  dependencies.encode.mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  await settle();
  wrapper.unmount();
  expect(dependencies.encode.mock.calls[0]![2].signal.aborted).toBe(true);
  finish(new ArrayBuffer(1));
  await flushPromises();
  await flush();
  expect(dependencies.persist).not.toHaveBeenCalled();
});
it('preserves aspect ratio for portrait and tiny canvases and resets identity for another project', async () => {
  const { host, flush } = setup();
  host.state.value!.canvas = { ...host.state.value!.canvas, width: 600, height: 1200 };
  await flush();
  expect(dependencies.encode.mock.calls[0]![2].outputSize).toEqual({ width: 135, height: 270 });
  host.state.value!.canvas = { ...host.state.value!.canvas, width: 1, height: 1 };
  await flush();
  expect(dependencies.encode.mock.calls[1]![2].outputSize).toEqual({ width: 1, height: 1 });
  host.document.value = { ...documentFixture(), id: 'another' };
  await flush();
  expect(dependencies.persist).toHaveBeenLastCalledWith('another', expect.any(Object));
});
