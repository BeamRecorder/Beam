const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runDevelopment } = require('../scripts/dev/beam.cjs');

function fixture(overrides = {}) {
  const processTarget = new EventEmitter();
  const calls = [];
  const server = {
    httpServer: { address: () => ({ port: 6512 }) },
    listen: async () => calls.push(['listen']),
    close: async () => calls.push(['close']),
  };
  const options = {
    args: [],
    root: path.resolve(__dirname, '..'),
    env: { PATH: '/bin' },
    processTarget,
    createServer: async (options) => {
      calls.push(['server', options]);
      return server;
    },
    getElectronPath: () => '/electron',
    resolveEngine: async (options) => {
      calls.push(['engine', options]);
      return '/native/capture-engine';
    },
    launchElectron: async (executable, options) => calls.push(['electron', executable, options]),
    log: (message) => calls.push(['log', message]),
    ...overrides,
  };
  return { options, calls, server, processTarget };
}

test('one command starts Vite, resolves native capture and launches Electron against the actual port', async () => {
  const { options, calls, processTarget } = fixture({ args: ['--session', 'preview'] });
  await runDevelopment(options);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['server', 'listen', 'log', 'engine', 'log', 'electron', 'close'],
  );
  const serverOptions = calls[0][1];
  assert.equal(serverOptions.root, undefined);
  assert.equal(serverOptions.configFile, path.join(options.root, 'vite.config.ts'));
  assert.deepEqual(serverOptions.server, { host: 'localhost', port: 6500, strictPort: false });
  assert.match(serverOptions.cacheDir, /[0-9a-f]{16}-preview$/);
  const launch = calls.find(([name]) => name === 'electron');
  assert.equal(launch[1], '/native/capture-engine');
  assert.equal(launch[2].electronPath, '/electron');
  assert.equal(launch[2].env.BEAM_DEV_SERVER_URL, 'http://localhost:6512');
  assert.equal(launch[2].env.BEAM_DEV_SESSION, 'preview');
  assert.equal(launch[2].env.PATH, '/bin');
  assert.deepEqual(options.env, { PATH: '/bin' });
  assert.equal(processTarget.listenerCount('SIGINT'), 0);
  assert.equal(processTarget.listenerCount('SIGTERM'), 0);
});

test('session environment is honored and command-line names take precedence', async () => {
  for (const [args, expected] of [
    [[], 'environment'],
    [['--session', 'cli'], 'cli'],
  ]) {
    const { options, calls } = fixture({ args, env: { BEAM_DEV_SESSION: 'environment' } });
    await runDevelopment(options);
    assert.equal(calls.find(([name]) => name === 'electron')[2].env.BEAM_DEV_SESSION, expected);
  }
});

test('the no-Rust option uses the existing verified cache/download workflow', async () => {
  const { options, calls } = fixture({ args: ['--force-no-rust'] });
  await runDevelopment(options);
  const engineOptions = calls.find(([name]) => name === 'engine')[1];
  assert.equal(engineOptions.hasCargo(), false);
  assert.equal(engineOptions.applicationRoot, options.root);
  assert.equal(engineOptions.version, require('../package.json').version);
});

test('invalid options and session names fail before starting any processes', async () => {
  for (const args of [['--unsupported'], ['--session'], ['--session', '../bad']]) {
    const { options, calls, processTarget } = fixture({ args });
    await assert.rejects(runDevelopment(options));
    assert.deepEqual(calls, []);
    assert.equal(processTarget.listenerCount('SIGINT'), 0);
  }
});

test('Vite creation failure removes signal handlers and launches no engine', async () => {
  const { options, calls, processTarget } = fixture({
    createServer: async () => {
      throw new Error('Vite creation failed');
    },
  });
  await assert.rejects(runDevelopment(options), /Vite creation failed/);
  assert.deepEqual(calls, []);
  assert.equal(processTarget.listenerCount('SIGTERM'), 0);
});

test('Vite listening failures and missing addresses dispose their server before returning', async () => {
  for (const failure of ['listen', 'address', 'socket']) {
    const { options, calls, server } = fixture();
    if (failure === 'listen')
      server.listen = async () => {
        throw new Error('listen failed');
      };
    else server.httpServer.address = () => (failure === 'address' ? null : '/tmp/socket');
    await assert.rejects(runDevelopment(options), /listen failed|development port/);
    assert.equal(calls.filter(([name]) => name === 'close').length, 1);
    assert.equal(
      calls.some(([name]) => name === 'engine'),
      false,
    );
  }
});

test('native resolution and Electron startup failures close Vite and remain failures', async () => {
  for (const dependency of ['getElectronPath', 'resolveEngine', 'launchElectron']) {
    const { options, calls, processTarget } = fixture({
      [dependency]: () => {
        throw new Error(`${dependency} failed`);
      },
    });
    await assert.rejects(runDevelopment(options), new RegExp(`${dependency} failed`));
    assert.equal(calls.filter(([name]) => name === 'close').length, 1);
    assert.equal(processTarget.listenerCount('SIGINT'), 0);
  }
});

test('cancellation during Vite creation closes the server without opening a port', async () => {
  const setup = fixture();
  setup.options.createServer = async () => {
    setup.processTarget.emit('SIGINT');
    return setup.server;
  };
  await runDevelopment(setup.options);
  assert.deepEqual(setup.calls, [['close']]);
});

test('cancellation during native resolution prevents a late Electron launch', async () => {
  const setup = fixture();
  setup.options.resolveEngine = async () => {
    setup.processTarget.emit('SIGTERM');
    return '/native/engine';
  };
  await runDevelopment(setup.options);
  assert.equal(
    setup.calls.some(([name]) => name === 'electron'),
    false,
  );
  assert.equal(setup.calls.filter(([name]) => name === 'close').length, 1);
});

test('SIGINT and SIGTERM abort the owned Electron process and close Vite once', async () => {
  for (const name of ['SIGINT', 'SIGTERM']) {
    const setup = fixture();
    setup.options.launchElectron = async (_executable, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Electron aborted')), { once: true });
        setup.processTarget.emit(name);
      });
    };
    await runDevelopment(setup.options);
    assert.equal(setup.calls.filter(([name]) => name === 'close').length, 1);
    assert.equal(setup.processTarget.listenerCount(name), 0);
  }
});

test(
  'real concurrent Vite servers isolate two worktrees and a second session in the same worktree',
  { timeout: 30_000 },
  async () => {
    const { createServer } = await import('vite');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-dev-parallel-'));
    const sessions = [];
    try {
      for (const name of ['one', 'two']) {
        const root = path.join(temporary, name);
        const rendererRoot = path.join(root, 'apps/desktop');
        fs.mkdirSync(path.join(rendererRoot, 'html'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3', type: 'module' }));
        fs.writeFileSync(
          path.join(root, 'vite.config.ts'),
          `export default { root: ${JSON.stringify(rendererRoot)} };`,
        );
        for (const entry of ['index', 'hud-panel', 'onboarding']) {
          fs.writeFileSync(
            path.join(rendererRoot, `html/${entry}.html`),
            `<html><body>worktree-${name}-${entry}</body></html>`,
          );
        }
      }
      for (const [worktree, name] of [
        ['one', 'default'],
        ['two', 'default'],
        ['one', 'second'],
      ]) {
        const ready = Promise.withResolvers();
        const session = {
          root: path.join(temporary, worktree),
          name,
          processTarget: new EventEmitter(),
          ready,
          worktree,
        };
        sessions.push(session);
        session.running = runDevelopment({
          root: session.root,
          args: ['--session', name],
          env: {},
          processTarget: session.processTarget,
          createServer: (options) => {
            session.cacheDir = options.cacheDir;
            return createServer({ ...options, logLevel: 'silent' });
          },
          resolveEngine: async () => '/native/engine',
          getElectronPath: () => '/electron',
          log: () => {},
          launchElectron: async (_executable, options) => {
            session.origin = options.env.BEAM_DEV_SERVER_URL;
            session.sessionName = options.env.BEAM_DEV_SESSION;
            ready.resolve();
            await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }));
          },
        });
        session.running.catch(ready.reject);
        await ready.promise;
      }
      assert.equal(new Set(sessions.map((session) => session.origin)).size, 3);
      assert.equal(new Set(sessions.map((session) => session.cacheDir)).size, 3);
      for (const session of sessions) {
        assert.equal(session.sessionName, session.name);
        for (const entry of ['index', 'hud-panel', 'onboarding']) {
          const response = await fetch(`${session.origin}/html/${entry}.html`);
          assert.equal(response.status, 200, `${session.name}: ${entry}`);
          assert.match(await response.text(), new RegExp(`worktree-${session.worktree}-${entry}`));
        }
      }
      sessions[0].processTarget.emit('SIGINT');
      await sessions[0].running;
      await assert.rejects(fetch(`${sessions[0].origin}/html/index.html`));
      assert.equal((await fetch(`${sessions[1].origin}/html/index.html`)).status, 200);
      assert.equal((await fetch(`${sessions[2].origin}/html/index.html`)).status, 200);
    } finally {
      for (const session of sessions) session.processTarget.emit('SIGTERM');
      await Promise.allSettled(sessions.map((session) => session.running));
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  },
);
