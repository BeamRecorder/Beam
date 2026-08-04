const { createMediaSegmentStorage, registerMediaSegmentIpc } = require('../media-segment-storage.cjs');

const UNKNOWN_OPUS_FORMAT = { codec: 'opus', sampleRate: 0, channels: 0 };

function systemAudioFormat(value = UNKNOWN_OPUS_FORMAT) {
  if (!value || typeof value !== 'object' || value.codec !== 'opus') throw new Error('Invalid system audio format.');
  for (const [key, name] of [
    ['sampleRate', 'System audio sample rate'],
    ['channels', 'System audio channels'],
  ])
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${name} must be a non-negative integer.`);
  return { mediaType: 'audio', sampleFormat: 'opus', sampleRate: value.sampleRate, channels: value.channels };
}

function createSystemAudioStorage(options) {
  return createMediaSegmentStorage({
    kind: 'system-audio',
    manifestKey: 'systemAudio',
    sourcePrefix: 'system-audio:chromium:',
    normalizeFormat: systemAudioFormat,
    ...options,
  });
}

function registerSystemAudioIpc({ ipcMain, storage }) {
  registerMediaSegmentIpc({ ipcMain, storage, channel: 'system-audio' });
}

module.exports = { createSystemAudioStorage, registerSystemAudioIpc };
