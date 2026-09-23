const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const { after, test } = require('node:test');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { registerScreenshotIpc } = require('../electron/screenshot/screenshot-ipc.cjs');

const fakeExecutable = path.join(os.tmpdir(), 'beam-fake-beam-media-engine');
const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const catalog = {
  sources: [{ id: 'display-1', kind: 'display', isDefault: true }],
  capabilities: { embeddedCursor: true },
};
const originalSpawn = childProcess.spawn;
const originalExistsSync = fs.existsSync;
const originalEngineOverride = process.env.BEAM_MEDIA_ENGINE;
let activeHarness = null;

childProcess.spawn = (executable, _args, _options) => {
  assert.equal(executable, fakeExecutable);
  assert.ok(activeHarness, 'A fake capture protocol harness must be active before spawning.');
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = (signal) => {
    child.killed = true;
    child.killCalls.push(signal);
    queueMicrotask(() => {
      child.exitCode = 0;
      child.emit('exit', 0, null);
      child.stdout.end();
      child.stderr.end();
    });
    return true;
  };
  child.killCalls = [];
  child.stdin = {
    write: (line, callback) => {
      let request;
      try {
        request = JSON.parse(line.toString());
      } catch (error) {
        callback?.(error);
        return false;
      }
      activeHarness.requests.push(request);
      if (request.version !== 1 || typeof request.command?.type !== 'string') {
        activeHarness.invalidRequests.push(request);
        callback?.(new TypeError('The capture protocol requires command to be a string.'));
        return false;
      }
      callback?.(null);
      queueMicrotask(() => {
        const { response, staleResponse } = activeHarness.respond(request);
        if (staleResponse) {
          activeHarness.responses.push(staleResponse);
          child.stdout.write(`${JSON.stringify(staleResponse)}\n`);
        }
        activeHarness.responses.push(response);
        child.stdout.write(`${JSON.stringify(response)}\n`);
      });
      return true;
    },
    end: () => {},
  };
  return child;
};
fs.existsSync = function (candidate, ...args) {
  return String(candidate) === fakeExecutable || originalExistsSync.call(fs, candidate, ...args);
};
process.env.BEAM_MEDIA_ENGINE = fakeExecutable;

const { MediaEngine } = require('../electron/capture/media-engine.cjs');

after(() => {
  childProcess.spawn = originalSpawn;
  fs.existsSync = originalExistsSync;
  if (originalEngineOverride === undefined) delete process.env.BEAM_MEDIA_ENGINE;
  else process.env.BEAM_MEDIA_ENGINE = originalEngineOverride;
});

function makeFixture({ failScreenshot = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-engine-protocol-'));
  const screenshotRoot = path.join(root, 'screenshots');
  const outputDirectory = path.join(root, 'exports');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const harness = {
    requests: [],
    responses: [],
    invalidRequests: [],
    respond(request) {
      const staleResponse = {
        version: 1,
        requestId: `unmatched-${request.id}`,
        ok: true,
        result: { stale: true },
      };
      if (request.command.type === 'sources') {
        return {
          staleResponse,
          response: { version: 1, requestId: request.id, ok: true, result: { screens: { Ok: catalog.sources } } },
        };
      }
      if (request.command.type === 'screenshot') {
        if (failScreenshot) {
          return {
            staleResponse,
            response: {
              version: 1,
              requestId: request.id,
              ok: false,
              error: { code: 'native-screenshot-error', message: 'native screenshot failed promptly' },
            },
          };
        }
        const output = path.join(root, 'native', request.command.config.projectId, 'session', 'screenshot.png');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, pngBytes);
        return {
          staleResponse,
          response: { version: 1, requestId: request.id, ok: true, result: { path: output, width: 1280, height: 720 } },
        };
      }
      return {
        staleResponse,
        response: { version: 1, requestId: request.id, ok: true, result: {} },
      };
    },
  };
  activeHarness = harness;
  process.env.BEAM_MEDIA_ENGINE = fakeExecutable;

  const engine = new MediaEngine({ isPackaged: false, getVersion: () => '1.2.3', getPath: () => root }, root);
  const store = createScreenshotStore(screenshotRoot);
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  registerScreenshotIpc({
    ipcMain,
    store,
    presetStore: {
      read: () => ({
        activePresetId: 'default',
        presets: [{ id: 'default', settings: { export: { format: 'png' } } }],
      }),
    },
    captureEngine: engine,
    BrowserWindow: { fromWebContents: () => null },
    dialog: {},
    clipboard: {},
    nativeImage: {},
    openEditor: async () => undefined,
    isTrustedRenderer: (url) => url === 'beam://app/index.html',
    canCapture: () => true,
    outputDirectory,
    platform: 'win32',
  });

  return {
    root,
    engine,
    store,
    harness,
    handlers,
    invoke: (payload) =>
      handlers.get('screenshot:capture')({ sender: { getURL: () => 'beam://app/index.html' } }, payload),
    async cleanup() {
      try {
        await engine.forceShutdown();
      } finally {
        activeHarness = null;
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

test(
  'Screenshot IPC uses versioned commands and correlates real engine JSONL replies by requestId',
  { timeout: 5_000 },
  async () => {
    const fixture = makeFixture();
    try {
      const result = await fixture.invoke({
        screenKind: 'display',
        screenId: 'display-1',
        region: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
        excludedWindowHandles: ['abc123'],
      });

      assert.deepEqual(fixture.harness.invalidRequests, []);
      assert.deepEqual(
        fixture.harness.requests.map((request) => request.command.type),
        ['sources', 'capabilities', 'permissions', 'screenshot'],
      );
      assert.ok(
        fixture.harness.requests.every((request) => request.version === 1 && typeof request.command.type === 'string'),
      );
      assert.deepEqual(
        { ...fixture.harness.requests[3].command.config, projectId: undefined },
        {
          screen: { mode: 'source', sourceId: 'display-1' },
          region: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
          projectId: undefined,
          excludedWindowHandles: ['abc123'],
        },
      );
      assert.equal(new Set(fixture.harness.requests.map((request) => request.id)).size, 4);
      assert.deepEqual(
        fixture.harness.responses
          .filter((response) => fixture.harness.requests.some((request) => request.id === response.requestId))
          .map((response) => response.requestId),
        fixture.harness.requests.map((request) => request.id),
      );
      assert.equal(fixture.harness.responses.length, 8, 'unmatched response IDs must be ignored');
      assert.equal(result.width, 1280);
      assert.equal(result.height, 720);
      assert.deepEqual(fs.readFileSync(fixture.store.fileForUrl(result.source)), pngBytes);
    } finally {
      await fixture.cleanup();
    }
  },
);

test(
  'Screenshot IPC surfaces correlated native errors promptly and removes pending projects',
  { timeout: 5_000 },
  async () => {
    const fixture = makeFixture({ failScreenshot: true });
    const startedAt = Date.now();
    try {
      await assert.rejects(
        fixture.invoke({ screenKind: 'display', screenId: 'display-1' }),
        (error) => error.code === 'native-screenshot-error' && /failed promptly/.test(error.message),
      );

      assert.ok(
        Date.now() - startedAt < 2_000,
        'the matching error response must reject before the 120-second timeout',
      );
      assert.deepEqual(
        fixture.harness.requests.map((request) => request.command.type),
        ['sources', 'capabilities', 'permissions', 'screenshot'],
      );
      const screenshotRequest = fixture.harness.requests[3];
      const screenshotError = fixture.harness.responses.find(
        (response) => response.requestId === screenshotRequest.id && !response.ok,
      );
      assert.equal(screenshotError.error.code, 'native-screenshot-error');
      assert.equal(fixture.store.list().length, 0);
    } finally {
      await fixture.cleanup();
    }
  },
);
