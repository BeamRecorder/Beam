const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { registerFatalLifecycle } = require('../electron/lifecycle/fatal-events.cjs');

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
