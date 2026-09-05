const assert = require('node:assert/strict');
const test = require('node:test');

const { createCameraRecordingControl, validateControl } = require('../electron/camera/recording-control.cjs');

const sourceId = 'camera:chromium:camera-1';
const sessionId = '019f84dd-4d9d-7f61-ac30-5da50169ecbc';
const preparedValue = (command) => ({
  recordingId: command.recordingId,
  sourceId,
  format: { codec: 'vp8', width: 1280, height: 720, nominalFps: 30 },
});

function createFixture({ timeoutMs = 100 } = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const commands = [];
  const configureCalls = [];
  const rendererReadyCalls = [];
  const hudMessages = [];
  const hudWebContents = { id: 1, send: (...message) => hudMessages.push(message) };
  const overlayWebContents = { id: 2 };
  const otherWebContents = { id: 3 };

  const ipcMain = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    on(channel, listener) {
      listeners.set(channel, listener);
    },
  };
  const cameraOverlay = {
    configure(state) {
      configureCalls.push(state);
    },
    sendRecordingCommand(command) {
      commands.push(command);
      return Promise.resolve();
    },
    markRendererReady(sender) {
      rendererReadyCalls.push(sender);
      return sender === overlayWebContents;
    },
    isRenderer(sender) {
      return sender === overlayWebContents;
    },
  };
  const cleanup = createCameraRecordingControl({
    ipcMain,
    cameraOverlay,
    hudWebContents,
    timeoutMs,
  });

  return {
    handlers,
    listeners,
    commands,
    configureCalls,
    rendererReadyCalls,
    hudMessages,
    hudWebContents,
    overlayWebContents,
    otherWebContents,
    cleanup,
    invoke(sender, control) {
      return handlers.get('camera-overlay:recording-control')({ sender }, control);
    },
    emit(channel, sender, payload) {
      listeners.get(channel)?.({ sender }, payload);
    },
  };
}

async function prepare(fixture) {
  const resultPromise = fixture.invoke(fixture.hudWebContents, { action: 'prepare', sourceId });
  await Promise.resolve();
  const command = fixture.commands.at(-1);
  fixture.emit('camera-overlay:recording-result', fixture.overlayWebContents, {
    commandId: command.commandId,
    ok: true,
    value: preparedValue(command),
  });
  return { result: await resultPromise, command };
}

async function completeControl(fixture, control, value) {
  const resultPromise = fixture.invoke(fixture.hudWebContents, control);
  await Promise.resolve();
  const command = fixture.commands.at(-1);
  fixture.emit('camera-overlay:recording-result', fixture.overlayWebContents, {
    commandId: command.commandId,
    ok: true,
    value,
  });
  return { result: await resultPromise, command };
}

test('accepts recording control only from the canonical HUD sender', async () => {
  const fixture = createFixture();

  await assert.rejects(
    fixture.invoke(fixture.otherWebContents, { action: 'prepare', sourceId }),
    /restricted to the HUD/,
  );
  assert.deepEqual(fixture.commands, []);
  assert.deepEqual(fixture.configureCalls, []);
});

test('rejects malformed controls before dispatching to the overlay', () => {
  assert.throws(() => validateControl(null), /Invalid camera action/);
  assert.throws(() => validateControl({ action: 'prepare', sourceId: 'camera:other:1' }), /Invalid camera source/);
  assert.throws(() => validateControl({ action: 'prepare', sourceId: 'camera:chromium:' }), /Invalid camera source/);
  assert.throws(() => validateControl({ action: 'start', recordingId: 'recording-1' }), /capture session identifier/);
  assert.throws(
    () => validateControl({ action: 'pause', recordingId: 'recording-1', endNs: Number.POSITIVE_INFINITY }),
    /camera segment end/,
  );
  assert.throws(
    () => validateControl({ action: 'fail', recordingId: 'recording-1', sessionId, reason: 'x'.repeat(501) }),
    /camera failure reason/,
  );
});

test('correlates results to the pending command and ignores other renderers or command ids', async () => {
  const fixture = createFixture();
  const resultPromise = fixture.invoke(fixture.hudWebContents, { action: 'prepare', sourceId });
  await Promise.resolve();
  const command = fixture.commands[0];
  let settled = false;
  void resultPromise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  fixture.emit('camera-overlay:recording-result', fixture.otherWebContents, {
    commandId: command.commandId,
    ok: true,
    value: preparedValue(command),
  });
  fixture.emit('camera-overlay:recording-result', fixture.overlayWebContents, {
    commandId: 'unrelated-command',
    ok: true,
    value: preparedValue(command),
  });
  await Promise.resolve();
  assert.equal(settled, false);

  fixture.emit('camera-overlay:recording-result', fixture.overlayWebContents, {
    commandId: command.commandId,
    ok: true,
    value: preparedValue(command),
  });
  assert.deepEqual(await resultPromise, preparedValue(command));
});

test('forwards renderer-ready only through the overlay identity and forwards fatal failures to the HUD', async () => {
  const fixture = createFixture();

  fixture.emit('camera-overlay:renderer-ready', fixture.otherWebContents);
  fixture.emit('camera-overlay:renderer-ready', fixture.overlayWebContents);
  assert.deepEqual(fixture.rendererReadyCalls, [fixture.otherWebContents, fixture.overlayWebContents]);

  const { result, command } = await prepare(fixture);
  assert.equal(result.recordingId, command.recordingId);
  fixture.emit('camera-overlay:recording-failure', fixture.otherWebContents, {
    recordingId: command.recordingId,
    message: 'ignored',
  });
  assert.deepEqual(fixture.hudMessages, []);

  fixture.emit('camera-overlay:recording-failure', fixture.overlayWebContents, {
    recordingId: command.recordingId,
    message: 'camera disconnected',
  });
  assert.deepEqual(fixture.hudMessages, [
    ['camera-overlay:recording-failure', { recordingId: command.recordingId, message: 'camera disconnected' }],
  ]);

  await assert.rejects(
    fixture.invoke(fixture.hudWebContents, { action: 'stop', recordingId: command.recordingId, endNs: 1 }),
    /no longer active/,
  );
});

test('clears the active recording after stop and allows a new preparation', async () => {
  const fixture = createFixture();
  const { command } = await prepare(fixture);

  const stopPromise = fixture.invoke(fixture.hudWebContents, {
    action: 'stop',
    recordingId: command.recordingId,
    endNs: 1,
  });
  await Promise.resolve();
  const stopCommand = fixture.commands.at(-1);
  fixture.emit('camera-overlay:recording-result', fixture.overlayWebContents, {
    commandId: stopCommand.commandId,
    ok: true,
  });
  assert.equal(await stopPromise, undefined);

  const next = await prepare(fixture);
  assert.notEqual(next.command.recordingId, command.recordingId);
});

test('runs the camera recording control state machine with the session timeline', async () => {
  const fixture = createFixture();
  const { command: prepareCommand } = await prepare(fixture);
  const recordingId = prepareCommand.recordingId;

  const start = await completeControl(fixture, {
    action: 'start',
    recordingId,
    sessionId,
    startNs: 0,
  });
  assert.deepEqual(start.command.control, {
    action: 'start',
    recordingId,
    sessionId,
    startNs: 0,
  });

  const pause = await completeControl(fixture, { action: 'pause', recordingId, endNs: 1_000_000_000 });
  assert.deepEqual(pause.command.control, { action: 'pause', recordingId, endNs: 1_000_000_000 });

  const commandCountBeforeMismatchedResume = fixture.commands.length;
  await assert.rejects(
    fixture.invoke(fixture.hudWebContents, {
      action: 'resume',
      recordingId,
      sessionId: '019f84dd-4d9d-7f61-ac30-5da50169ecbd',
      startNs: 2_000_000_000,
    }),
    /session does not match/,
  );
  assert.equal(fixture.commands.length, commandCountBeforeMismatchedResume);

  const resume = await completeControl(fixture, {
    action: 'resume',
    recordingId,
    sessionId,
    startNs: 2_000_000_000,
  });
  assert.deepEqual(resume.command.control, {
    action: 'resume',
    recordingId,
    sessionId,
    startNs: 2_000_000_000,
  });

  const stop = await completeControl(fixture, { action: 'stop', recordingId, endNs: 3_000_000_000 });
  assert.deepEqual(stop.command.control, { action: 'stop', recordingId, endNs: 3_000_000_000 });
  assert.equal(stop.result, undefined);
});

test('rejects a pending command on timeout and permits a later preparation', async () => {
  const fixture = createFixture({ timeoutMs: 5 });

  await assert.rejects(
    fixture.invoke(fixture.hudWebContents, { action: 'prepare', sourceId }),
    /did not answer in time/,
  );
  const next = await prepare(fixture);
  assert.equal(next.result.sourceId, sourceId);
});

test('cleanup rejects pending commands and clears the active recording', async () => {
  const fixture = createFixture({ timeoutMs: 1_000 });
  const pending = fixture.invoke(fixture.hudWebContents, { action: 'prepare', sourceId });
  await Promise.resolve();
  fixture.cleanup();

  await assert.rejects(pending, /control was closed/);
  await assert.rejects(
    fixture.invoke(fixture.hudWebContents, { action: 'stop', recordingId: fixture.commands[0].recordingId, endNs: 1 }),
    /no longer active/,
  );
});

test('cleanup notifies the HUD once for an active recording and rejects pending work', async () => {
  const fixture = createFixture({ timeoutMs: 1_000 });
  const { command } = await prepare(fixture);
  const pendingStop = fixture.invoke(fixture.hudWebContents, {
    action: 'stop',
    recordingId: command.recordingId,
    endNs: 1,
  });
  await Promise.resolve();

  fixture.cleanup();
  fixture.cleanup();

  await assert.rejects(pendingStop, /control was closed/);
  assert.deepEqual(fixture.hudMessages, [
    [
      'camera-overlay:recording-failure',
      { recordingId: command.recordingId, message: 'Camera recording control was closed.' },
    ],
  ]);
});
