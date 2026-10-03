import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { documentFixture, presetFixture } from '../tests/screenshot-editor-test-helpers';
import { stateFixture } from '../export/tests/export-test-support';
const api = vi.hoisted(() => ({ getScreenshot: vi.fn(), listBackgroundLibrary: vi.fn(), getEditorPresets: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: api }));
import { createScreenshotStartup } from './screenshot-startup';
beforeEach(() => {
  api.getScreenshot.mockReset().mockResolvedValue(documentFixture());
  api.listBackgroundLibrary.mockReset().mockResolvedValue([]);
  api.getEditorPresets.mockReset().mockResolvedValue(presetFixture());
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it('starts all metadata requests immediately and reuses them while the module loads', async () => {
  const startup = createScreenshotStartup();
  startup.start('id');
  expect(api.getScreenshot).toHaveBeenCalledWith('id');
  expect(api.listBackgroundLibrary).toHaveBeenCalledOnce();
  expect(api.getEditorPresets).toHaveBeenCalledWith('screenshot');
  const module = startup.measure('module', async () => 'loaded');
  await expect(startup.load('id')).resolves.toEqual([documentFixture(), [], presetFixture()]);
  await module;
  expect(api.getScreenshot).toHaveBeenCalledOnce();
  expect(startup.report()).toMatchObject({
    projectId: 'id',
    timings: {
      module: expect.any(Number),
      document: expect.any(Number),
      backgroundLibrary: expect.any(Number),
      presets: expect.any(Number),
    },
  });
});
it('captures state/history/first-render times and finishes once without exposing project contents', async () => {
  const state = stateFixture();
  api.getScreenshot.mockResolvedValue({ ...documentFixture(), state, history: { undo: [state], redo: [state] } });
  const startup = createScreenshotStartup();
  await startup.load('id');
  expect(startup.time('history', () => 42)).toBe(42);
  startup.record('fonts', 10);
  startup.finish(800, 450);
  startup.finish(800, 450);
  startup.fail('too late');
  expect(startup.report()).toMatchObject({
    status: 'ready',
    preview: { width: 800, height: 450 },
    scene: { images: 0, shapes: 0, layers: 0, historySnapshots: 2 },
    timings: { fonts: 10, history: expect.any(Number) },
  });
  expect(console.info).toHaveBeenCalledOnce();
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[Beam media:screenshot-load]'));
  startup.record('fonts', 200);
  expect(startup.report()!.timings.fonts).toBe(10);
  startup.report()!.timings.fonts = 300;
  expect(startup.report()!.timings.fonts).toBe(10);
});
it('ignores measurements and scene metadata from a superseded project request', async () => {
  let finish!: (doc: ReturnType<typeof documentFixture>) => void;
  api.getScreenshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const startup = createScreenshotStartup();
  const old = startup.load('old');
  await startup.load('new');
  const current = startup.report();
  finish({ ...documentFixture(), state: { ...stateFixture(), shapes: [{} as never] } });
  await old;
  expect(startup.report()).toEqual(current);
  expect(api.getScreenshot).toHaveBeenCalledTimes(2);
});
it('records failed async and synchronous phases and preserves the actual error', async () => {
  const startup = createScreenshotStartup();
  await startup.load('id');
  await expect(
    startup.measure('module', async () => {
      throw new Error('compile failed');
    }),
  ).rejects.toThrow('compile failed');
  expect(() =>
    startup.time('state', () => {
      throw 'bad state';
    }),
  ).toThrow('bad state');
  startup.fail(new Error('compile failed'));
  expect(startup.report()).toMatchObject({
    status: 'error',
    error: 'compile failed',
    timings: { module: expect.any(Number), state: expect.any(Number) },
  });
  expect(console.info).toHaveBeenCalledOnce();
});
it('retains prefetch errors until the screenshot child awaits them', async () => {
  api.getScreenshot.mockRejectedValueOnce(new Error('document missing'));
  const startup = createScreenshotStartup();
  startup.start('id');
  await expect(startup.load('id')).rejects.toThrow('document missing');
  startup.fail('document missing');
  expect(startup.report()!.error).toBe('document missing');
});
it('does not manufacture a report without a project and supports repeated opens with new requests', async () => {
  const startup = createScreenshotStartup();
  startup.record('fonts', 4);
  startup.finish(1, 1);
  startup.fail('empty');
  expect(startup.report()).toBeNull();
  expect(console.info).not.toHaveBeenCalled();
  await startup.load('id');
  startup.finish(1, 1);
  startup.start('id');
  await startup.load('id');
  expect(startup.report()!.status).toBe('loading');
  expect(api.getScreenshot).toHaveBeenCalledTimes(2);
});
