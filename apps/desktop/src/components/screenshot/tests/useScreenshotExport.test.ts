import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScreenshotExport } from '../useScreenshotExport';
import { documentFixture } from './screenshot-editor-test-helpers';
import { stateFixture } from '../export/tests/export-test-support';
import type { ScreenshotExportHost } from '../screenshot-export-types';
import type { ScreenshotWorkerOptions } from '../export/screenshot-export-types';
const native = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: { exportScreenshot: native.publish } }));
const setup = () => {
  const host: ScreenshotExportHost = {
    document: ref(documentFixture()),
    state: ref(stateFixture()),
    busy: ref(false),
    error: ref(''),
    copied: ref(false),
    finishText: vi.fn(),
    save: vi.fn(async () => {}),
    fail: vi.fn(),
    notify: vi.fn(),
    encode: vi.fn(async (_source, _state, options?: ScreenshotWorkerOptions) => {
      options?.onPreview?.('data:image/png;base64,preview');
      options?.onTiming?.('worker.render', 12);
      return new ArrayBuffer(8);
    }),
  };
  return { host, run: useScreenshotExport(host) };
};
beforeEach(() => {
  native.publish
    .mockReset()
    .mockResolvedValue({ status: 'copied', path: null, timings: { clipboardWrite: 25, total: 30 } });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it('reports snapshot failures and releases the editor without starting publication', async () => {
  const { host, run } = setup();
  const state = host.state.value!;
  Object.assign(state, { circular: state });
  await run(true);
  expect(host.busy.value).toBe(false);
  expect(native.publish).not.toHaveBeenCalled();
  expect(host.notify).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'error', error: expect.any(String), timings: { snapshot: expect.any(Number) } }),
    undefined,
  );
});
it('starts encoding while saving is pending and waits for both before copying', async () => {
  const { host, run } = setup();
  let finish!: () => void;
  vi.mocked(host.save).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = run(true);
  await flushPromises();
  expect(host.encode).toHaveBeenCalledOnce();
  expect(native.publish).not.toHaveBeenCalled();
  expect(host.busy.value).toBe(true);
  finish();
  await pending;
  expect(host.copied.value).toBe(true);
  expect(host.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'copy',
      status: 'success',
      bytes: 8,
      timings: expect.objectContaining({ 'worker.render': 12, 'native.clipboardWrite': 25, save: expect.any(Number) }),
    }),
    'data:image/png;base64,preview',
  );
});
it('marks a cached copy and retains PNG while leaving the WebP document untouched', async () => {
  const { host, run } = setup();
  host.state.value!.format = 'webp';
  vi.mocked(host.encode).mockImplementation(async (_src, state, options) => {
    expect(state.format).toBe('png');
    options?.onCacheHit?.();
    return new ArrayBuffer(4);
  });
  await run(true);
  expect(host.state.value!.format).toBe('webp');
  expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({ cacheHit: true, status: 'success' }), undefined);
});
it('confirms a saved image only after native publication resolves', async () => {
  const { host, run } = setup();
  native.publish.mockResolvedValue({ status: 'saved', path: '/tmp/image.png', timings: { fileWrite: 5 } });
  await run(false);
  expect(host.copied.value).toBe(false);
  expect(host.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'export',
      status: 'success',
      timings: expect.objectContaining({ 'native.fileWrite': 5 }),
    }),
    expect.any(String),
  );
});
it('does not turn a dismissed save dialog into success or an error toast', async () => {
  const { host, run } = setup();
  native.publish.mockResolvedValue({ status: 'cancelled', path: null, timings: { saveDialog: 40 } });
  await run(false);
  expect(host.notify).not.toHaveBeenCalled();
  expect(host.fail).not.toHaveBeenCalled();
  expect(host.busy.value).toBe(false);
  expect(console.info).toHaveBeenCalledWith(
    '[Beam Screenshot export]',
    expect.objectContaining({ status: 'cancelled' }),
  );
});
it('keeps the rendered thumbnail on a clipboard failure and releases busy state', async () => {
  const { host, run } = setup();
  native.publish.mockRejectedValue(new Error('Clipboard denied'));
  await run(true);
  expect(host.copied.value).toBe(false);
  expect(host.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'Clipboard denied' }));
  expect(host.notify).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'error', error: 'Clipboard denied', totalMs: expect.any(Number) }),
    'data:image/png;base64,preview',
  );
  expect(host.busy.value).toBe(false);
});
it('cancels active encoding if saving fails, without publishing or leaving an active job', async () => {
  const { host, run } = setup();
  vi.mocked(host.save).mockRejectedValue(new Error('Disk full'));
  vi.mocked(host.encode).mockImplementation(
    (_source, _state, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
      }),
  );
  await run(true);
  expect(native.publish).not.toHaveBeenCalled();
  expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({ error: 'Disk full' }), undefined);
  expect(host.busy.value).toBe(false);
});
it('reports string encoding failures and ignores unavailable or already busy editors', async () => {
  const { host, run } = setup();
  vi.mocked(host.encode).mockRejectedValue('Render unavailable');
  await run(true);
  expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({ error: 'Render unavailable' }), undefined);
  host.busy.value = true;
  await run(true);
  host.busy.value = false;
  host.state.value = null;
  await run(true);
  host.state.value = stateFixture();
  host.document.value = null;
  await run(false);
  expect(host.encode).toHaveBeenCalledOnce();
});
