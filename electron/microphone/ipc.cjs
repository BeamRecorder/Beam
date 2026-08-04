const { createMediaSegmentStorage, registerMediaSegmentIpc } = require('../media-segment-storage.cjs')

const UNKNOWN_OPUS_FORMAT = { codec: 'opus', sampleRate: 0, channels: 0 }

function microphoneFormat(value = UNKNOWN_OPUS_FORMAT) {
  if (!value || typeof value !== 'object' || value.codec !== 'opus') throw new Error('Invalid microphone format.')
  for (const [key, name] of [
    ['sampleRate', 'Microphone sample rate'],
    ['channels', 'Microphone channels'],
  ])
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error(`${name} must be a non-negative integer.`)
  return { mediaType: 'audio', sampleFormat: 'opus', sampleRate: value.sampleRate, channels: value.channels }
}

function createMicrophoneStorage(options) {
  return createMediaSegmentStorage({
    kind: 'microphone',
    sourcePrefix: 'microphone:chromium:',
    normalizeFormat: microphoneFormat,
    ...options,
  })
}

function registerMicrophoneIpc({ ipcMain, storage }) {
  registerMediaSegmentIpc({ ipcMain, storage, channel: 'microphone' })
}

module.exports = { createMicrophoneStorage, registerMicrophoneIpc }
