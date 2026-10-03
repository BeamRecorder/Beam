import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bitmap, stateFixture } from './export-test-support';
import type {
  ScreenshotExportReply,
  ScreenshotExportRequest,
  ScreenshotExportTransfer,
} from '../screenshot-export-types';
const preparation = vi.hoisted(() => ({ assets: vi.fn() }));
vi.mock('../screenshot-export-assets', () => ({ screenshotExportAssets: preparation.assets }));
import { encodeScreenshot } from '../screenshot-export';

let transfer: ScreenshotExportTransfer;
let workers: FakeWorker[];
let constructionError: Error | null;
let sendError: Error | null;
class FakeWorker {
  url: URL;
  options: WorkerOptions;
  onmessage: ((event: MessageEvent<ScreenshotExportReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((_request: ScreenshotExportRequest, _transfer: Transferable[]) => {
    if (sendError) throw sendError;
  });
  constructor(url: URL, options: WorkerOptions) {
    this.url = url;
    this.options = options;
    if (constructionError) throw constructionError;
    workers.push(this);
  }
  reply(data: ScreenshotExportReply) {
    this.onmessage!(new MessageEvent('message', { data }));
  }
}
beforeEach(() => {
  workers = [];
  constructionError = sendError = null;
  const logo = bitmap();
  transfer = { decorations: { logo }, transfer: [logo] };
  preparation.assets.mockReset().mockResolvedValue(transfer);
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('creates a module worker only on export and transfers SVG decorations without IPC or decoded photos', async () => {
  const state = stateFixture(),
    bytes = new ArrayBuffer(4);
  const pending = encodeScreenshot('source', state);
  await flushPromises();
  const worker = workers[0]!;
  expect(worker.options).toEqual({ type: 'module' });
  expect(worker.url.pathname).toContain('screenshot-export.worker.ts');
  expect(worker.postMessage).toHaveBeenCalledWith(
    { source: new URL('source', document.baseURI).href, state, decorations: transfer.decorations },
    transfer.transfer,
  );
  worker.reply({ bytes });
  await expect(pending).resolves.toBe(bytes);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(transfer.transfer[0]!.close).toHaveBeenCalledOnce();
});
it.each(['http://localhost:6500/html/editor.html', 'file:///beam/dist/html/editor.html'])(
  'resolves media against the editor document rather than the worker path in %s',
  async (base) => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue(base);
    const state = stateFixture();
    state.background = { kind: 'image', id: 'back', name: 'Back', path: '../wallpapers/back.webp', extension: 'webp' };
    state.images = [
      {
        ...state.image,
        kind: 'image',
        id: 'image',
        source: 'project-media://screenshot/test/media/photo.png',
        width: 10,
        height: 10,
      },
      { ...state.image, kind: 'image', id: 'relative', source: '../photo.png', width: 10, height: 10 },
    ];
    const original = structuredClone(state);
    const pending = encodeScreenshot('../source.png', state);
    await flushPromises();
    expect(workers[0]!.postMessage).toHaveBeenCalledWith(
      {
        source: new URL('../source.png', base).href,
        state: {
          ...state,
          background: { ...state.background, path: new URL('../wallpapers/back.webp', base).href },
          images: state.images.map((image) => ({ ...image, source: new URL(image.source, base).href })),
        },
        decorations: transfer.decorations,
      },
      transfer.transfer,
    );
    expect(state).toEqual(original);
    workers[0]!.reply({ bytes: new ArrayBuffer(1) });
    await pending;
  },
);
it('rejects invalid output bounds before loading decorations', async () => {
  const state = stateFixture();
  state.canvas.width = 20000;
  await expect(encodeScreenshot('source', state)).rejects.toThrow(/64 megapixels/);
  expect(preparation.assets).not.toHaveBeenCalled();
  expect(workers).toHaveLength(0);
});
it('leaves generated color backgrounds without a media URL', async () => {
  const state = stateFixture();
  state.background = { kind: 'color', id: 'color', name: 'Color', color: '#123456' };
  const pending = encodeScreenshot('source', state);
  await flushPromises();
  expect(workers[0]!.postMessage.mock.calls[0]![0].state.background).toEqual(state.background);
  workers[0]!.reply({ bytes: new ArrayBuffer(1) });
  await pending;
});
it('propagates decoration failures without constructing a worker', async () => {
  preparation.assets.mockRejectedValueOnce(new Error('missing cursor'));
  await expect(encodeScreenshot('source', stateFixture())).rejects.toThrow('missing cursor');
  expect(workers).toHaveLength(0);
});
it.each(['construction', 'send'])('closes owned transfers when worker %s fails', async (phase) => {
  if (phase === 'construction') constructionError = new Error('worker unavailable');
  else sendError = new Error('transfer failed');
  await expect(encodeScreenshot('source', stateFixture())).rejects.toThrow(
    phase === 'construction' ? 'worker unavailable' : 'transfer failed',
  );
  expect(transfer.transfer[0]!.close).toHaveBeenCalledOnce();
  if (workers[0]) expect(workers[0].terminate).toHaveBeenCalledOnce();
});
it.each(['reply', 'runtime', 'message'])('reports worker %s failure and terminates it', async (phase) => {
  const pending = encodeScreenshot('source', stateFixture());
  const assertion = expect(pending).rejects.toThrow(phase === 'message' ? 'unreadable' : 'render failed');
  await flushPromises();
  const worker = workers[0]!;
  if (phase === 'reply') worker.reply({ error: 'render failed' });
  if (phase === 'runtime') worker.onerror!(new ErrorEvent('error', { message: 'render failed' }));
  if (phase === 'message') worker.onmessageerror!();
  await assertion;
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(transfer.transfer[0]!.close).toHaveBeenCalledOnce();
});
it('aborts before loading, after preparing transfers, and while the worker is running', async () => {
  const before = new AbortController();
  before.abort(new Error('before'));
  await expect(encodeScreenshot('source', stateFixture(), { signal: before.signal })).rejects.toThrow('before');
  expect(preparation.assets).not.toHaveBeenCalled();
  const prepared = new AbortController();
  preparation.assets.mockImplementationOnce(async () => {
    prepared.abort(new Error('prepared'));
    return transfer;
  });
  await expect(encodeScreenshot('source', stateFixture(), { signal: prepared.signal })).rejects.toThrow('prepared');
  expect(transfer.transfer[0]!.close).toHaveBeenCalledOnce();
  const running = new AbortController();
  const pending = encodeScreenshot('source', stateFixture(), { signal: running.signal });
  const assertion = expect(pending).rejects.toThrow('running');
  await flushPromises();
  running.abort(new Error('running'));
  await assertion;
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
});
