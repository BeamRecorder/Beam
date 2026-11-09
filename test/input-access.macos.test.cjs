const assert = require('node:assert/strict');
const test = require('node:test');
const { InputAccess, registerInputAccessIpc } = require('../apps/desktop/electron/input/input-access.cjs');

const available = { state: 'available', canRequest: false, clicks: true, shortcuts: true, recordsText: false };
const required = { ...available, state: 'permission-required', canRequest: true, clicks: false, shortcuts: false };
const cursor = { captureClicks: true, captureShortcuts: false };
const access = (nativeRequest, openExternal) => new InputAccess({ platform: 'darwin', nativeRequest, openExternal });

test('macOS authorizes mouse capture without enabling optional keyboard recording', async () => {
  const calls = [];
  const input = access(async (command) => {
    calls.push(command);
    return command === 'input-access-status' ? required : available;
  });
  input.onAvailable = () => assert.fail('keyboard recording choice changed');
  assert.equal(input.helperForCapture(), null);
  await input.ensureReady(cursor);
  assert.deepEqual(calls, ['input-access-status', 'request-input-access']);
});

test('macOS preserves existing authorization without another prompt or preference write', async () => {
  const calls = [];
  const input = access(async (command) => {
    calls.push(command);
    return available;
  });
  input.onAvailable = () => assert.fail('preferences changed');
  await input.ensureReady(cursor);
  assert.deepEqual(calls, ['input-access-status']);
});

for (const state of ['denied', 'permission-required', 'unavailable']) {
  test(`macOS reports ${state} access instead of continuing without clicks`, async () => {
    const input = access(async (command) => (command === 'input-access-status' ? required : { ...required, state }));
    await assert.rejects(input.ensureReady(cursor), {
      code: 'input-access-unavailable',
      message:
        'macOS Input Monitoring is required to record clicks and shortcuts. Enable Beam in System Settings > Privacy & Security > Input Monitoring, then start a new recording.',
    });
  });
}

test('macOS keeps the native permission failure diagnostic', async () => {
  const input = access(async (command) => {
    if (command === 'request-input-access')
      throw Object.assign(new Error('Input Monitoring denied'), { code: 'permission-denied' });
    return required;
  });
  await assert.rejects(input.ensureReady(cursor), { code: 'permission-denied', message: 'Input Monitoring denied' });
});

test('macOS shares concurrent recording authorization without activating shortcuts', async () => {
  let resolve;
  let prompts = 0;
  const input = access(async (command) => {
    if (command === 'input-access-status') return required;
    prompts++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  input.onAvailable = () => assert.fail('shortcuts enabled');
  const first = input.ensureReady(cursor);
  const second = input.ensureReady(cursor);
  await new Promise((done) => setImmediate(done));
  assert.equal(prompts, 1);
  resolve(available);
  await Promise.all([first, second]);
});

test('an explicit interaction request shares macOS authorization and persists the requested choice', async () => {
  let resolve;
  let prompts = 0;
  let activated = 0;
  const input = access(async (command) => {
    if (command === 'input-access-status') return required;
    prompts++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  input.onAvailable = () => {
    activated++;
  };
  const recording = input.ensureReady(cursor);
  await new Promise((done) => setImmediate(done));
  const explicit = input.request();
  resolve(available);
  await Promise.all([recording, explicit]);
  assert.equal(prompts, 1);
  assert.equal(activated, 1);
});

test('failed macOS authorization can be retried without a stale pending promise', async () => {
  let prompts = 0;
  const input = access(async (command) => {
    if (command === 'input-access-status') return required;
    if (++prompts === 1) throw new Error('native request failed');
    return available;
  });
  await assert.rejects(input.ensureReady(cursor), /native request failed/);
  await input.ensureReady(cursor);
  assert.equal(prompts, 2);
});

for (const state of ['denied', 'permission-required']) {
  test(`macOS ${state} authorization opens the Input Monitoring pane`, async () => {
    const urls = [];
    const input = access(
      async () => ({ ...required, state }),
      async (url) => urls.push(url),
    );
    assert.equal((await input.authorize()).state, state);
    assert.deepEqual(urls, ['x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent']);
  });
}

test('macOS successful authorization does not open System Settings', async () => {
  const input = access(
    async () => available,
    () => assert.fail('unnecessary settings window'),
  );
  assert.equal((await input.authorize()).state, 'available');
});

test('macOS backend failures do not open unrelated System Settings', async () => {
  const input = access(
    async () => ({ ...required, state: 'unavailable' }),
    () => assert.fail('unexpected settings'),
  );
  assert.equal((await input.authorize()).state, 'unavailable');
});

test('a failed System Settings launch is reported and can be retried', async () => {
  let attempts = 0;
  const input = access(
    async () => required,
    async () => {
      if (++attempts === 1) throw new Error('System Settings could not open');
    },
  );
  await assert.rejects(input.authorize(), /System Settings could not open/);
  assert.equal((await input.authorize()).state, 'permission-required');
  assert.equal(attempts, 2);
});

test('macOS IPC authorization preserves the independent keyboard recording choice', async () => {
  const handlers = new Map();
  const input = access(async () => available);
  registerInputAccessIpc({ handle: (name, run) => handlers.set(name, run) }, input, {
    store: { read: () => assert.fail('must not activate keyboard recording') },
    BrowserWindow: {},
  });
  assert.deepEqual(await handlers.get('input-access:request')(), available);
});
