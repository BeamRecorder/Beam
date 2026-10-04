const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { registerFatalLifecycle } = require('../apps/desktop/electron/lifecycle/fatal-events.cjs');

const setup = () => {
  const app = new EventEmitter();
  const powerMonitor = new EventEmitter();
  const processTarget = new EventEmitter();
  const requests = [];
  let accepting = true;
  app.quit = () => requests.push('quit');
  app.exit = (code) => requests.push(`exit:${code}`);
  const coordinator = {
    canAcceptWork: () => accepting,
    requestShutdown: async (source) => {
      accepting = false;
      requests.push(source);
    },
  };
  registerFatalLifecycle({ app, powerMonitor, processTarget, coordinator });
  return { app, powerMonitor, processTarget, requests };
};

test('renderer, GPU and main JavaScript failures enter the central fatal shutdown path', async () => {
  for (const trigger of [
    ({ app }) => app.emit('render-process-gone', {}, { id: 7 }, { reason: 'crashed', exitCode: 9 }),
    ({ app }) => app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 9 }),
    ({ processTarget }) => processTarget.emit('uncaughtException', new Error('boom')),
    ({ processTarget }) => processTarget.emit('unhandledRejection', new Error('boom')),
  ]) {
    const context = setup();
    trigger(context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(context.requests.includes('fatal') || context.requests.includes('renderer-crash'));
    assert.ok(context.requests.includes('exit:1'));
  }
});

test('OS shutdown and signals request normal quit while clean Electron children are ignored', () => {
  const context = setup();
  context.app.emit('child-process-gone', {}, { type: 'Utility', reason: 'clean-exit', exitCode: 0 });
  assert.deepEqual(context.requests, []);
  context.powerMonitor.emit('shutdown');
  context.processTarget.emit('SIGTERM');
  assert.deepEqual(context.requests, ['quit', 'quit']);
});

test('destroyed-object rejections remain fatal while the application is running', async () => {
  const context = setup();
  context.processTarget.emit('unhandledRejection', new Error('Object has been destroyed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(context.requests, ['fatal', 'exit:1']);
});

test('late destroyed-object and renderer notifications are harmless during teardown', async () => {
  const context = setup();
  context.processTarget.emit('uncaughtException', new Error('first failure'));
  context.processTarget.emit('unhandledRejection', new Error('Object has been destroyed'));
  context.app.emit(
    'render-process-gone',
    {},
    {
      get id() {
        throw new Error('destroyed');
      },
    },
    {},
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(context.requests, ['fatal', 'exit:1']);
});

test('a destroyed renderer cannot prevent an active crash from being handled', async () => {
  for (const contents of [
    undefined,
    { isDestroyed: () => true },
    {
      get id() {
        throw new Error('Object has been destroyed');
      },
    },
  ]) {
    const context = setup();
    context.app.emit('render-process-gone', {}, contents, { reason: 'crashed', exitCode: 9 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(context.requests, ['renderer-crash', 'exit:1']);
  }
});
