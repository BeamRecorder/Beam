import { beforeEach, expect, it, vi } from 'vitest';
import { stateFixture } from './export-test-support';
const rendering = vi.hoisted(() => ({ encode: vi.fn() }));
vi.mock('../screenshot-export', () => ({ encodeScreenshot: rendering.encode }));
import { createScreenshotExporter } from '../screenshot-export-cache';
beforeEach(() => rendering.encode.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer));

it('is lazy and reuses an unchanged encoded screenshot without making mutable aliases', async () => {
  const exporter = createScreenshotExporter();
  expect(rendering.encode).not.toHaveBeenCalled();
  const state = stateFixture();
  const first = await exporter.encode('source', state);
  new Uint8Array(first)[0] = 99;
  const second = await exporter.encode('source', structuredClone(state));
  expect(new Uint8Array(second)).toEqual(new Uint8Array([1, 2, 3]));
  new Uint8Array(second)[0] = 77;
  expect(new Uint8Array(await exporter.encode('source', state))[0]).toBe(1);
  expect(rendering.encode).toHaveBeenCalledOnce();
});
it.each(['source', 'format', 'quality', 'dimensions', 'appearance'])(
  'invalidates cached bytes after changing %s',
  async (change) => {
    const exporter = createScreenshotExporter(),
      state = stateFixture();
    await exporter.encode('source', state);
    if (change === 'format') state.format = 'webp';
    if (change === 'quality') state.quality = 0.4;
    if (change === 'dimensions') state.canvas.width = 1500;
    if (change === 'appearance') state.image.appearance.borderEnabled = true;
    await exporter.encode(change === 'source' ? 'changed' : 'source', state);
    expect(rendering.encode).toHaveBeenCalledTimes(2);
  },
);
it.each([16 * 1024 * 1024, 16 * 1024 * 1024 + 1])(
  'enforces the 16 MiB encoded-byte cache budget at %s bytes',
  async (size) => {
    rendering.encode.mockResolvedValue(new ArrayBuffer(size));
    const exporter = createScreenshotExporter(),
      state = stateFixture();
    await exporter.encode('source', state);
    await exporter.encode('source', state);
    expect(rendering.encode).toHaveBeenCalledTimes(size <= 16 * 1024 * 1024 ? 1 : 2);
  },
);
it('does not cache a failed export and permits a real retry', async () => {
  rendering.encode.mockRejectedValueOnce(new Error('encoding failed'));
  const exporter = createScreenshotExporter();
  await expect(exporter.encode('source', stateFixture())).rejects.toThrow('encoding failed');
  await expect(exporter.encode('source', stateFixture())).resolves.toBeInstanceOf(ArrayBuffer);
  expect(rendering.encode).toHaveBeenCalledTimes(2);
});
it('does not run overlapping jobs in one editor or share another editor cache', async () => {
  let finish!: (bytes: ArrayBuffer) => void;
  rendering.encode.mockImplementationOnce(() => new Promise<ArrayBuffer>((resolve) => (finish = resolve)));
  const exporter = createScreenshotExporter(),
    state = stateFixture();
  const pending = exporter.encode('source', state);
  await expect(exporter.encode('source', state)).rejects.toThrow('Another screenshot export is active.');
  finish(new ArrayBuffer(1));
  await pending;
  await createScreenshotExporter().encode('source', state);
  expect(rendering.encode).toHaveBeenCalledTimes(2);
});
it('rejects an already-cancelled request even when matching bytes are cached', async () => {
  const exporter = createScreenshotExporter(),
    state = stateFixture();
  await exporter.encode('source', state);
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await expect(exporter.encode('source', state, { signal: controller.signal })).rejects.toThrow('cancelled');
  expect(rendering.encode).toHaveBeenCalledOnce();
});
it('aborts active work and releases the cache when the editor is disposed', async () => {
  rendering.encode.mockImplementationOnce(
    (_source, _state, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  );
  const exporter = createScreenshotExporter();
  const pending = exporter.encode('source', stateFixture());
  exporter.dispose();
  exporter.dispose();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await expect(exporter.encode('source', stateFixture())).rejects.toThrow('Screenshot exporter is disposed.');
});
it('forwards external cancellation and does not cache a late aborted result', async () => {
  let finish!: (bytes: ArrayBuffer) => void;
  rendering.encode.mockImplementationOnce(() => new Promise<ArrayBuffer>((resolve) => (finish = resolve)));
  const controller = new AbortController(),
    exporter = createScreenshotExporter();
  const pending = exporter.encode('source', stateFixture(), { signal: controller.signal });
  controller.abort('stop');
  finish(new ArrayBuffer(1));
  await expect(pending).rejects.toBe('stop');
  expect(rendering.encode.mock.calls[0]![2].signal.aborted).toBe(true);
  await exporter.encode('source', stateFixture());
  expect(rendering.encode).toHaveBeenCalledTimes(2);
});
