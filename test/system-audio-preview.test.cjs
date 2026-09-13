const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { createSystemAudioPreview } = require('../electron/capture/system-audio-preview.cjs');

function createSender() {
  const sender = new EventEmitter();
  let destroyed = false;
  sender.isDestroyed = () => destroyed;
  sender.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    sender.emit('destroyed');
  };
  return sender;
}

function createPreviewHarness({ request: requestOverride, canCleanup = () => true, canStart = () => true } = {}) {
  const calls = [];
  let state = 'idle';
  let level = 0.42;
  const request = async (command) => {
    calls.push(command);
    if (requestOverride)
      return requestOverride(command, { calls, getState: () => state, setState: (value) => (state = value) });
    if (command === 'status') return { state };
    if (command === 'system-audio-preview-level') return { level };
    return {};
  };
  const preview = createSystemAudioPreview({ request, canCleanup, canStart });
  return {
    calls,
    preview,
    setLevel: (value) => (level = value),
    setState: (value) => (state = value),
  };
}

test('shares one native preview between HUD and Quick Snip until the last client releases it', async () => {
  const { calls, preview } = createPreviewHarness();
  const hud = createSender();
  const quickSnip = createSender();

  await Promise.all([preview.start(hud), preview.start(hud), preview.start(quickSnip)]);

  assert.equal(hud.listenerCount('destroyed'), 1, 'repeated acquisition by one renderer is idempotent');
  assert.equal(quickSnip.listenerCount('destroyed'), 1);
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 1);
  assert.deepEqual(await preview.level(quickSnip), { level: 0.42 });

  await preview.stop(hud);
  assert.equal(calls.filter((command) => command === 'stop-system-audio-preview').length, 0);
  assert.deepEqual(await preview.level(quickSnip), { level: 0.42 });

  await preview.stop(quickSnip);
  await preview.stop(quickSnip);
  assert.equal(calls.filter((command) => command === 'stop-system-audio-preview').length, 1);
  assert.equal(quickSnip.listenerCount('destroyed'), 0);
});

test('does not start preview during capture and resumes it for an active client after completion', async () => {
  const { calls, preview, setState } = createPreviewHarness();
  const hud = createSender();

  assert.deepEqual(await preview.level(hud), { level: 0 });
  assert.deepEqual(calls, [], 'an unsubscribed renderer cannot start or poll the native preview');

  setState('recording');
  await preview.start(hud);
  assert.deepEqual(await preview.level(hud), { level: 0 });
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 0);

  setState('completed');
  assert.deepEqual(await preview.level(hud), { level: 0.42 });
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 1);
});

test('a prepare invalidation prevents an in-flight preview start from becoming active again', async () => {
  let releaseStart;
  const startGate = new Promise((resolve) => {
    releaseStart = resolve;
  });
  const { calls, preview, setState } = createPreviewHarness({
    request: async (command, context) => {
      if (command === 'status') return { state: context.getState() };
      if (command === 'start-system-audio-preview') return startGate;
      if (command === 'system-audio-preview-level') return { level: 0.8 };
      return {};
    },
  });
  const quickSnip = createSender();

  const starting = preview.start(quickSnip);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.includes('start-system-audio-preview'), true);

  preview.invalidate();
  setState('prepared');
  releaseStart({ started: true });
  await starting;

  assert.deepEqual(await preview.level(quickSnip), { level: 0 });
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 1);

  setState('completed');
  assert.deepEqual(await preview.level(quickSnip), { level: 0.8 });
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 2);
});

test('removes a failed start client and allows level polling to retry transient errors', async () => {
  let failStart = true;
  let failLevel = true;
  const { calls, preview } = createPreviewHarness({
    request: async (command, context) => {
      if (command === 'status') return { state: context.getState() };
      if (command === 'start-system-audio-preview' && failStart) {
        failStart = false;
        throw new Error('preview startup failed');
      }
      if (command === 'system-audio-preview-level' && failLevel) {
        failLevel = false;
        throw new Error('temporary level failure');
      }
      if (command === 'system-audio-preview-level') return { level: 0.25 };
      return {};
    },
  });
  const quickSnip = createSender();

  await assert.rejects(preview.start(quickSnip), /preview startup failed/);
  assert.equal(quickSnip.listenerCount('destroyed'), 0);
  assert.deepEqual(await preview.level(quickSnip), { level: 0 });

  await preview.start(quickSnip);
  await assert.rejects(preview.level(quickSnip), /temporary level failure/);
  assert.equal(quickSnip.listenerCount('destroyed'), 1, 'a level error must not discard the subscription');
  assert.deepEqual(await preview.level(quickSnip), { level: 0.25 });
  assert.equal(calls.filter((command) => command === 'start-system-audio-preview').length, 2);
});

test('releases a renderer subscription and stops the preview when its WebContents is destroyed', async () => {
  const { calls, preview } = createPreviewHarness();
  const quickSnip = createSender();

  await preview.start(quickSnip);
  quickSnip.destroy();
  assert.deepEqual(await preview.level(quickSnip), { level: 0 });

  assert.equal(quickSnip.listenerCount('destroyed'), 0);
  assert.equal(calls.filter((command) => command === 'stop-system-audio-preview').length, 1);
});

test('detaches destroyed clients without native stop once application shutdown begins', async () => {
  let canStart = true;
  let canCleanup = true;
  const { calls, preview } = createPreviewHarness({
    canCleanup: () => canCleanup,
    canStart: () => canStart,
  });
  const quickSnip = createSender();

  await preview.start(quickSnip);
  canStart = false;
  canCleanup = false;
  quickSnip.destroy();
  // The destroyed event schedules cleanup internally. Queueing stop and awaiting it
  // drains that cleanup without relying on a timer or the Electron event loop.
  await preview.stop(quickSnip);

  assert.equal(quickSnip.listenerCount('destroyed'), 0);
  assert.deepEqual(calls, ['status', 'start-system-audio-preview']);
});

test('settles an in-flight stop quietly only when shutdown starts before it rejects', async () => {
  let canCleanup = true;
  let rejectStop;
  const stopRequest = new Promise((_resolve, reject) => {
    rejectStop = reject;
  });
  const { calls, preview } = createPreviewHarness({
    canCleanup: () => canCleanup,
    request: async (command, context) => {
      if (command === 'status') return { state: context.getState() };
      if (command === 'stop-system-audio-preview') return stopRequest;
      return {};
    },
  });
  const quickSnip = createSender();

  await preview.start(quickSnip);
  const stopping = preview.stop(quickSnip);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.includes('stop-system-audio-preview'), true);

  canCleanup = false;
  rejectStop(new Error('capture-engine force shutdown'));
  await stopping;
});

test('does not request native cleanup or respawn after the engine has disappeared', async () => {
  let enginePresent = true;
  const requestsAfterExit = [];
  let respawns = 0;
  const { calls, preview } = createPreviewHarness({
    canCleanup: () => enginePresent,
    canStart: () => enginePresent,
    request: async (command, context) => {
      if (!enginePresent) {
        requestsAfterExit.push(command);
        respawns += 1;
        throw new Error('request would start a new capture-engine');
      }
      if (command === 'status') return { state: context.getState() };
      return {};
    },
  });
  const quickSnip = createSender();

  await preview.start(quickSnip);
  enginePresent = false;
  quickSnip.destroy();
  await preview.stop(quickSnip);

  assert.deepEqual(calls, ['status', 'start-system-audio-preview']);
  assert.deepEqual(requestsAfterExit, []);
  assert.equal(respawns, 0);
});

test('does not start or poll preview after the lifecycle disallows native work', async () => {
  let canStart = true;
  const { calls, preview } = createPreviewHarness({ canStart: () => canStart });
  const activeClient = createSender();
  const newClient = createSender();

  await preview.start(activeClient);
  const activeRequests = [...calls];
  canStart = false;

  await preview.start(newClient);
  assert.deepEqual(await preview.level(activeClient), { level: 0 });

  assert.equal(activeClient.listenerCount('destroyed'), 1);
  assert.equal(newClient.listenerCount('destroyed'), 0);
  assert.deepEqual(calls, activeRequests);
});

test('propagates a stop failure while native cleanup is still allowed', async () => {
  const { calls, preview } = createPreviewHarness({
    request: async (command, context) => {
      if (command === 'status') return { state: context.getState() };
      if (command === 'stop-system-audio-preview') throw new Error('live preview stop failed');
      return {};
    },
  });
  const quickSnip = createSender();

  await preview.start(quickSnip);
  await assert.rejects(preview.stop(quickSnip), /live preview stop failed/);
  assert.equal(calls.filter((command) => command === 'stop-system-audio-preview').length, 1);
});
