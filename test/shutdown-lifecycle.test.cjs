const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createShutdownCoordinator } = require('../electron/lifecycle/shutdown-coordinator.cjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('shutdown is idempotent, gates concurrent requests, and runs each cleanup once', async () => {
  let releaseGracefulStop;
  let gracefulCalls = 0;
  let forceCalls = 0;
  let cleanupCalls = 0;
  const captureEngine = {
    shutdown: () => {
      gracefulCalls += 1;
      return new Promise((resolve) => {
        releaseGracefulStop = resolve;
      });
    },
    forceShutdown: async () => {
      forceCalls += 1;
    },
  };
  const coordinator = createShutdownCoordinator({ captureEngine, gracefulDeadlineMs: 1000 });
  coordinator.registerCleanup({ id: 'window', cleanup: () => (cleanupCalls += 1) });

  const first = coordinator.requestShutdown('before-quit');
  const second = coordinator.requestShutdown('renderer-crash');
  assert.strictEqual(first, second);
  assert.equal(coordinator.isShuttingDown(), true);
  await sleep(0);
  assert.equal(gracefulCalls, 1);

  releaseGracefulStop();
  await first;

  assert.equal(forceCalls, 1);
  assert.equal(cleanupCalls, 1);
  assert.equal(coordinator.isComplete(), true);
  assert.strictEqual(coordinator.requestShutdown('tray'), first);
});

test('the coordinator enforces a global shutdown deadline over a hung native stop', async () => {
  let forceCalls = 0;
  let cleanupCalls = 0;
  const captureEngine = {
    shutdown: () => new Promise(() => {}),
    forceShutdown: async () => {
      forceCalls += 1;
    },
  };
  const coordinator = createShutdownCoordinator({
    captureEngine,
    gracefulDeadlineMs: 200,
    cleanupDeadlineMs: 200,
    shutdownDeadlineMs: 40,
  });
  coordinator.registerCleanup({ id: 'countdown', cleanup: () => (cleanupCalls += 1) });

  const startedAt = Date.now();
  const result = await coordinator.requestShutdown('fatal');
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 150, `shutdown exceeded the global deadline (${elapsed}ms)`);
  assert.equal(forceCalls, 1);
  assert.equal(cleanupCalls, 1);
  assert.equal(coordinator.isComplete(), true);
  assert.ok(result.errors.some((message) => /deadline|exceeded/i.test(message)));
});

test('cleanup errors are recorded while other resources continue to be cleaned up', async () => {
  const cleaned = [];
  const captureEngine = {
    shutdown: async () => {},
    forceShutdown: async () => {},
  };
  const coordinator = createShutdownCoordinator({ captureEngine, cleanupDeadlineMs: 20 });
  coordinator.registerCleanup({
    id: 'broken-window',
    cleanup: async () => {
      await sleep(50);
      throw new Error('destroy failed');
    },
  });
  coordinator.registerCleanup({ id: 'tray', cleanup: () => cleaned.push('tray') });

  const result = await coordinator.requestShutdown('window-all-closed');

  assert.deepEqual(cleaned, ['tray']);
  assert.ok(result.errors.some((message) => /broken-window:.*exceeded|destroy failed/.test(message)));
  assert.equal(coordinator.isComplete(), true);
});
