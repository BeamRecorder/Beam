// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ExportRequest } from '@beam/encoder';
import { exportInChromium } from './chromium-export';

const state = vi.hoisted(() => ({
  executable: vi.fn(async () => '/chrome'),
  bundle: vi.fn(async () => new Map()),
  launch: vi.fn(),
  completed: undefined as ((result: unknown) => void) | undefined,
  failed: undefined as ((error: Error) => void) | undefined,
  goto: vi.fn(),
  pageOn: vi.fn(),
  browserOn: vi.fn(),
  permissions: vi.fn(),
  close: vi.fn(),
  rm: vi.fn(),
  serverClose: vi.fn(),
  abort: vi.fn(),
  mkdir: vi.fn(),
  popupClose: vi.fn(),
}));
vi.mock('puppeteer-core', () => ({ default: { launch: state.launch } }));
vi.mock('node:fs/promises', () => ({
  mkdir: state.mkdir,
  mkdtemp: async () => '/cache/owned-beam',
  rm: state.rm,
}));
vi.mock('./gpu-monitor', () => ({ createCliGpuMonitor: () => ({ finish: async () => undefined }) }));
vi.mock('./chromium-install', () => ({ chromiumExecutable: state.executable }));
vi.mock('./chromium-settings', () => ({
  chromiumSettings: () => ({ args: ['--headless'] }),
}));
vi.mock('./local-assets', () => ({
  registerRenderAssets: (request: ExportRequest) => ({
    request,
    files: new Map(),
  }),
}));
vi.mock('@beam/storage/node/binary-output', () => ({
  createBinaryOutput: async () => ({ abort: state.abort }),
}));
vi.mock('./render-bundle', () => ({ buildRenderBundle: state.bundle }));
vi.mock('./bundle-server', () => ({
  serveRenderBundle: async () => ({
    origin: 'http://127.0.0.1:9000',
    close: state.serverClose,
  }),
}));
vi.mock('./browser-lifecycle', () => ({ closeExportBrowser: state.close }));
vi.mock('./export-server', () => ({
  createExportServer: (
    _auth: string,
    _job: ExportRequest,
    _files: Map<string, string>,
    _output: unknown,
    completed: (result: unknown) => void,
    failed: (error: Error) => void,
  ) => {
    state.completed = completed;
    state.failed = failed;
    return vi.fn();
  },
}));
const request = {} as ExportRequest;
beforeEach(() => {
  vi.clearAllMocks();
  state.executable.mockResolvedValue('/chrome');
  state.bundle.mockResolvedValue(new Map());
  const page = { on: state.pageOn, goto: state.goto, mainFrame: () => 'main' };
  state.launch.mockResolvedValue({
    on: state.browserOn,
    createBrowserContext: async () => ({
      overridePermissions: state.permissions,
      newPage: async () => page,
    }),
  });
  state.goto.mockReset().mockImplementation(async () => {
    state.completed?.({ path: 'published' });
  });
});
afterEach(() => vi.unstubAllEnvs());
it('runs the independent compiled host and releases every owned resource on completion', async () => {
  expect(await exportInChromium(request, '/input', '/output')).toEqual({
    path: 'published',
  });
  expect(state.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      executablePath: '/chrome',
      headless: true,
      pipe: true,
    }),
  );
  expect(state.permissions).toHaveBeenCalledWith('http://127.0.0.1:9000', []);
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.serverClose).toHaveBeenCalledOnce();
  expect(state.abort).toHaveBeenCalledOnce();
  expect(state.rm).toHaveBeenCalledWith('/cache/owned-beam', {
    recursive: true,
    force: true,
  });
});
it('propagates navigation failure and aborts partial output', async () => {
  state.goto.mockRejectedValueOnce(new Error('navigation failed'));
  await expect(exportInChromium(request, '/input', '/output')).rejects.toThrow('navigation failed');
  expect(state.abort).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});
it('cleans up staged output when building the bundle fails before browser launch', async () => {
  state.bundle.mockRejectedValueOnce(new Error('bundle failed'));
  await expect(exportInChromium(request, '/input', '/output')).rejects.toThrow('bundle failed');
  expect(state.launch).not.toHaveBeenCalled();
  expect(state.rm).toHaveBeenCalledOnce();
  expect(state.abort).toHaveBeenCalledOnce();
});
it('does not stage output when Chromium is unavailable', async () => {
  state.executable.mockRejectedValueOnce(new Error('install Chrome'));
  await expect(exportInChromium(request, '/input', '/output')).rejects.toThrow('install Chrome');
  expect(state.abort).not.toHaveBeenCalled();
});
it('reports backend diagnostics, closes popups and accepts only its own main-frame URL', async () => {
  vi.stubEnv('BEAM_DEBUG', '1');
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    state.goto.mockImplementationOnce(async (url: string) => {
      const handler = (name: string) =>
        state.pageOn.mock.calls
          .slice()
          .reverse()
          .find((call) => call[0] === name)![1];
      handler('console')({ text: () => 'progress' });
      handler('requestfailed')({
        url: () => '/asset',
        failure: () => ({ errorText: 'failed' }),
      });
      handler('requestfailed')({ url: () => '/asset', failure: () => null });
      handler('popup')({ close: state.popupClose });
      handler('popup')(null);
      handler('framenavigated')({ url: () => 'http://subframe' });
      state.completed?.({ url });
    });
    await exportInChromium(request, '/input', '/output');
    expect(state.popupClose).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalled();
  } finally {
    stderr.mockRestore();
  }
});
it('rejects interruption, browser disconnection, page errors and unexpected navigation', async () => {
  for (const failure of ['signal', 'disconnected', 'pageerror', 'navigation']) {
    state.goto.mockImplementationOnce(async () => {
      if (failure === 'signal') process.emit('SIGINT');
      if (failure === 'disconnected') state.browserOn.mock.calls.at(-1)![1]();
      if (failure === 'pageerror')
        state.pageOn.mock.calls
          .slice()
          .reverse()
          .find((call) => call[0] === 'pageerror')![1](new Error('page failed'));
      if (failure === 'navigation')
        state.pageOn.mock.calls
          .slice()
          .reverse()
          .find((call) => call[0] === 'framenavigated')![1]('main');
    });
    // Use a frame that can be identified and queried like Puppeteer's main frame.
    if (failure === 'navigation') {
      const frame = { url: () => 'http://unexpected/' };
      state.launch.mockResolvedValueOnce({
        on: state.browserOn,
        createBrowserContext: async () => ({
          overridePermissions: state.permissions,
          newPage: async () => ({
            on: state.pageOn,
            mainFrame: () => frame,
            goto: async () =>
              state.pageOn.mock.calls
                .slice()
                .reverse()
                .find((call) => call[0] === 'framenavigated')![1](frame),
          }),
        }),
      });
    }
    await expect(exportInChromium(request, '/input', '/output')).rejects.toThrow();
  }
});
