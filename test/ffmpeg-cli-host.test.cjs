const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { EventEmitter } = require('node:events');
const { runInNewContext } = require('node:vm');
const code = readFileSync(join(__dirname, '../apps/cli/src/ffmpeg-host.cjs'), 'utf8');

function host({ platform = 'linux', rendererUrl = 'http://127.0.0.1:3456/gpu-export.html', run } = {}) {
  const calls = [],
    writes = [],
    errors = [],
    permissions = {};
  const config = {
    rendererUrl,
    profile: '/owned/profile',
    nativeDirectory: '/native',
    preload: '/preload.cjs',
    id: 'job',
    temporaryPath: '/output.tmp',
    resultPath: '/result.json',
    request: {},
  };
  const process = Object.assign(new EventEmitter(), { platform, argv: ['beam', 'host.cjs', '/config.json'] });
  let exit;
  const finished = new Promise((resolve) => {
    exit = resolve;
  });
  const app = Object.assign(new EventEmitter(), {
    setPath: (...args) => calls.push(['setPath', ...args]),
    commandLine: { appendSwitch: (name) => calls.push(['switch', name]) },
    whenReady: () => {
      calls.push(['ready']);
      return Promise.resolve();
    },
    exit: (status) => exit(status),
  });
  const session = {
    defaultSession: {
      setPermissionRequestHandler: (handler) => {
        permissions.request = handler;
      },
      setPermissionCheckHandler: (handler) => {
        permissions.check = handler;
      },
    },
  };
  const factory = (options) => {
    calls.push(['factory', options]);
    return {
      run: async (owner, job, request) => (run ? run({ owner, job, request, app }) : { encodedPacketCount: 1 }),
    };
  };
  runInNewContext(code, {
    process,
    URL,
    console: { error: (...args) => errors.push(args.join(' ')) },
    require: (name) => {
      if (name === 'electron') return { app, session, BrowserWindow: 'Window', ipcMain: 'ipc' };
      if (name === 'node:fs')
        return { readFileSync: () => JSON.stringify(config), writeFileSync: (...args) => writes.push(args) };
      if (name === '@beam/electron-export') return { createExperimentalGpuExport: factory };
      throw new Error(name);
    },
  });
  return { calls, writes, errors, permissions, finished, app, process };
}

test('uncaps only the isolated export host before readiness and publishes confirmed diagnostics', async () => {
  const value = host();
  assert.equal(await value.finished, 0);
  assert.deepEqual(value.calls.slice(0, 3), [
    ['setPath', 'userData', '/owned/profile'],
    ['switch', 'disable-frame-rate-limit'],
    ['ready'],
  ]);
  assert.equal(value.calls[3][1].renderer.url, 'http://127.0.0.1:3456/gpu-export.html');
  assert.equal(value.calls[3][1].nativeDirectory, '/native');
  assert.equal(value.writes[0][0], '/result.json');
  assert.deepEqual(JSON.parse(value.writes[0][1]), { encodedPacketCount: 1 });
  assert.equal(value.writes[0][2].flag, 'wx');
  assert.equal(value.writes[0][2].mode, 0o600);
});
test('denies permissions and does not intercept quitting after a completed export', async () => {
  const value = host();
  await value.finished;
  let allowed;
  value.permissions.request(null, 'camera', (answer) => {
    allowed = answer;
  });
  assert.equal(allowed, false);
  assert.equal(value.permissions.check(), false);
  let prevented = false;
  value.app.emit('before-quit', {
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
});
test('cancels a running job on quit and never writes success diagnostics on failure', async () => {
  let cancelled = 0,
    prevented = false;
  const value = host({
    run: async ({ app, job }) => {
      job.cancel = () => cancelled++;
      app.emit('before-quit', {
        preventDefault: () => {
          prevented = true;
        },
      });
      assert.equal(job.cancelled, true);
      throw new Error('cancelled');
    },
  });
  assert.equal(await value.finished, 1);
  assert.equal(cancelled, 1);
  assert.equal(prevented, true);
  assert.deepEqual(value.writes, []);
  assert.match(value.errors[0], /cancelled/);
});
test('interrupts before readiness and validates platform/origin before creating export services', async () => {
  const value = host({
    run: async ({ job }) => {
      assert.equal(job.cancelled, true);
      throw 'interrupted';
    },
  });
  value.process.emit('SIGTERM');
  assert.equal(await value.finished, 1);
  assert.match(value.errors[0], /interrupted/);
  assert.throws(() => host({ platform: 'darwin' }), /Invalid/);
  assert.throws(() => host({ rendererUrl: 'https://example.com/' }), /Invalid/);
});
