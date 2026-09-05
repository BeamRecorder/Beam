const crypto = require('node:crypto');

const CAMERA_PREFIX = 'camera:chromium:';
const ACTIONS = new Set(['prepare', 'start', 'pause', 'resume', 'stop', 'fail']);

function assertText(value, name, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`Invalid ${name}.`);
}

function assertTimestamp(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
}

function validateAppearance(value) {
  if (value === undefined) return;
  if (
    !value ||
    !['none', 'sm', 'md', 'lg'].includes(value.shadowSize) ||
    !['none', 'sm', 'md', 'lg', 'full'].includes(value.cornerRadius)
  )
    throw new Error('Invalid camera appearance.');
}

function validatePlacement(value) {
  if (value === undefined) return;
  if (
    !value ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])) ||
    value.x < 0 ||
    value.y < 0 ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.x + value.width > 1 ||
    value.y + value.height > 1
  )
    throw new Error('Invalid camera placement.');
}

function validFormat(value) {
  return (
    value?.codec === 'vp8' &&
    ['width', 'height', 'nominalFps'].every((key) => Number.isSafeInteger(value[key]) && value[key] > 0)
  );
}

function validateControl(value) {
  if (!value || typeof value !== 'object' || !ACTIONS.has(value.action)) throw new Error('Invalid camera action.');
  if (value.action === 'prepare') {
    assertText(value.sourceId, 'camera source', 2_000);
    if (!value.sourceId.startsWith(CAMERA_PREFIX) || value.sourceId.length === CAMERA_PREFIX.length)
      throw new Error('Invalid camera source.');
    return value;
  }
  assertText(value.recordingId, 'camera recording identifier', 100);
  if (value.action === 'start') {
    assertText(value.sessionId, 'capture session identifier', 100);
    assertTimestamp(value.startNs, 'camera segment start');
    validateAppearance(value.appearance);
    validatePlacement(value.placement);
  } else if (value.action === 'resume') {
    assertText(value.sessionId, 'capture session identifier', 100);
    assertTimestamp(value.startNs, 'camera segment start');
  } else if (value.action === 'fail') {
    assertText(value.sessionId, 'capture session identifier', 100);
    assertText(value.reason, 'camera failure reason');
  } else assertTimestamp(value.endNs, 'camera segment end');
  return value;
}

function createCameraRecordingControl({ ipcMain, cameraOverlay, hudWebContents, timeoutMs = 30_000 }) {
  const pending = new Map();
  let activeRecordingId = null;
  let activeSessionId = null;
  let activePhase = 'idle';

  const dispatch = (command) =>
    new Promise((resolve, reject) => {
      const abort = new AbortController();
      const timeout = setTimeout(() => {
        pending.delete(command.commandId);
        abort.abort();
        reject(new Error('The camera overlay did not answer in time.'));
      }, timeoutMs);
      pending.set(command.commandId, { resolve, reject, timeout, abort });
      void cameraOverlay.sendRecordingCommand(command, { signal: abort.signal }).catch((error) => {
        const entry = pending.get(command.commandId);
        if (!entry) return;
        clearTimeout(entry.timeout);
        pending.delete(command.commandId);
        entry.reject(error);
      });
    });

  ipcMain.handle('camera-overlay:recording-control', async (event, rawControl) => {
    if (event.sender !== hudWebContents) throw new Error('Camera recording commands are restricted to the HUD.');
    const control = validateControl(rawControl);
    const preparing = control.action === 'prepare';
    if (preparing) {
      if (activeRecordingId) throw new Error('Another camera recording is already active.');
      activeRecordingId = crypto.randomUUID();
      activeSessionId = null;
      activePhase = 'preparing';
      cameraOverlay.configure({ cameraId: control.sourceId });
    } else if (control.recordingId !== activeRecordingId) {
      throw new Error('The camera recording is no longer active.');
    } else if (control.action === 'start' && activePhase !== 'prepared') {
      throw new Error('The camera recording is not ready to start.');
    } else if (control.action === 'pause' && activePhase !== 'recording') {
      throw new Error('The camera recording is not active.');
    } else if (control.action === 'resume' && activePhase !== 'paused') {
      throw new Error('The camera recording is not paused.');
    } else if ((control.action === 'resume' || control.action === 'fail') && activeSessionId !== control.sessionId) {
      throw new Error('The camera recording session does not match.');
    }
    const command = { commandId: crypto.randomUUID(), recordingId: activeRecordingId, control };
    try {
      const result = await dispatch(command);
      if (preparing) {
        if (
          !result ||
          result.recordingId !== activeRecordingId ||
          result.sourceId !== control.sourceId ||
          !validFormat(result.format)
        )
          throw new Error('The camera overlay returned an invalid preparation result.');
        activePhase = 'prepared';
      } else if (control.action === 'start') {
        activeSessionId = control.sessionId;
        activePhase = 'recording';
      } else if (control.action === 'pause') activePhase = 'paused';
      else if (control.action === 'resume') activePhase = 'recording';
      return result;
    } catch (error) {
      if (preparing) {
        activeRecordingId = null;
        activePhase = 'idle';
      }
      throw error;
    } finally {
      if (control.action === 'stop' || control.action === 'fail') {
        activeRecordingId = null;
        activeSessionId = null;
        activePhase = 'idle';
      }
    }
  });

  ipcMain.on('camera-overlay:renderer-ready', (event) => cameraOverlay.markRendererReady(event.sender));
  ipcMain.on('camera-overlay:recording-result', (event, result) => {
    if (!cameraOverlay.isRenderer(event.sender) || !result || typeof result !== 'object') return;
    const entry = pending.get(result.commandId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    entry.abort.abort();
    pending.delete(result.commandId);
    if (result.ok) entry.resolve(result.value);
    else {
      const name = typeof result.error?.name === 'string' ? result.error.name : 'Error';
      const message = typeof result.error?.message === 'string' ? result.error.message : 'Camera command failed.';
      entry.reject(Object.assign(new Error(`${name}: ${message}`), { name }));
    }
  });
  ipcMain.on('camera-overlay:recording-failure', (event, failure) => {
    if (
      !cameraOverlay.isRenderer(event.sender) ||
      !failure ||
      failure.recordingId !== activeRecordingId ||
      typeof failure.message !== 'string'
    )
      return;
    hudWebContents.send('camera-overlay:recording-failure', {
      recordingId: activeRecordingId,
      message: failure.message.slice(0, 500),
    });
    activeRecordingId = null;
    activeSessionId = null;
    activePhase = 'idle';
  });

  return (reason = 'Camera recording control was closed.') => {
    if (activeRecordingId && (typeof hudWebContents.isDestroyed !== 'function' || !hudWebContents.isDestroyed())) {
      hudWebContents.send('camera-overlay:recording-failure', {
        recordingId: activeRecordingId,
        message: reason.slice(0, 500),
      });
    }
    activeRecordingId = null;
    activeSessionId = null;
    activePhase = 'idle';
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.abort.abort();
      entry.reject(new Error('Camera recording control was closed.'));
    }
    pending.clear();
  };
}

module.exports = { createCameraRecordingControl, validateControl };
