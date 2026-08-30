const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const SOURCE_PREFIX = 'microphone:chromium:';

function validRecordingId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

function voiceoverFormat(value) {
  if (!value || typeof value !== 'object' || value.codec !== 'opus') throw new Error('Invalid voice-over format.');
  for (const key of ['sampleRate', 'channels']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0)
      throw new Error(`Voice-over ${key} must be a non-negative integer.`);
  }
  return { codec: 'opus', sampleRate: value.sampleRate, channels: value.channels };
}

function createProjectVoiceoverStorage({ projectStore, fsModule = fs, pathModule = path }) {
  const recordings = new Map();

  const recordingFor = (ownerId, recordingId) => {
    if (!validRecordingId(recordingId)) throw new Error('Invalid voice-over recording.');
    const recording = recordings.get(recordingId);
    if (!recording || recording.ownerId !== ownerId)
      throw new Error('Voice-over recording was not found or is not authorized.');
    return recording;
  };

  const close = (recording) => {
    if (recording.handle !== null) fsModule.closeSync(recording.handle);
    recording.handle = null;
  };

  const abortRecording = (recording) => {
    close(recording);
    if (fsModule.existsSync(recording.partialPath)) fsModule.rmSync(recording.partialPath, { force: true });
    recordings.delete(recording.id);
  };

  const begin = (ownerId, payload = {}) => {
    const directory = projectStore.directoryFor(payload.projectId);
    if (
      typeof payload.sourceId !== 'string' ||
      !payload.sourceId.startsWith(SOURCE_PREFIX) ||
      payload.sourceId.length === SOURCE_PREFIX.length
    )
      throw new Error('Invalid voice-over microphone source.');
    const format = voiceoverFormat(payload.format);
    const mediaDirectory = pathModule.join(directory, 'media');
    fsModule.mkdirSync(mediaDirectory, { recursive: true });
    const id = crypto.randomUUID();
    const fileName = `${crypto.randomUUID()}.webm`;
    const targetPath = pathModule.join(mediaDirectory, fileName);
    const partialPath = `${targetPath}.${id}.voiceover.partial`;
    const handle = fsModule.openSync(partialPath, 'wx');
    recordings.set(id, {
      id,
      ownerId,
      projectId: payload.projectId,
      sourceId: payload.sourceId,
      format,
      fileName,
      targetPath,
      partialPath,
      handle,
      position: 0,
      nextSequence: 0,
    });
    return { recordingId: id };
  };

  const write = (ownerId, payload = {}) => {
    const recording = recordingFor(ownerId, payload.recordingId);
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== recording.nextSequence)
      throw new Error('Invalid voice-over chunk sequence.');
    const data = payload.data;
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHUNK_BYTES)
      throw new Error('Invalid voice-over chunk size.');
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const written = fsModule.writeSync(
        recording.handle,
        buffer,
        offset,
        buffer.byteLength - offset,
        recording.position + offset,
      );
      if (!Number.isSafeInteger(written) || written <= 0) throw new Error('Voice-over chunk write failed.');
      offset += written;
    }
    recording.position += data.byteLength;
    recording.nextSequence += 1;
  };

  const finalize = (ownerId, payload = {}) => {
    const recording = recordingFor(ownerId, payload.recordingId);
    if (recording.position === 0) {
      abortRecording(recording);
      throw new Error('Voice-over recording contains no audio data.');
    }
    fsModule.fsyncSync(recording.handle);
    close(recording);
    fsModule.renameSync(recording.partialPath, recording.targetPath);
    recordings.delete(recording.id);
    const fileUrl = pathToFileURL(recording.targetPath).href;
    return {
      id: crypto.randomUUID(),
      kind: 'audio',
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 160) : 'Voice-over',
      fileName: recording.fileName,
      durationMs: 0,
      width: null,
      height: null,
      src: projectStore.mediaUrlFor(fileUrl) || '',
      origin: 'project',
    };
  };

  const abort = (ownerId, recordingId) => abortRecording(recordingFor(ownerId, recordingId));

  const cleanupOwner = (ownerId) => {
    for (const recording of recordings.values()) if (recording.ownerId === ownerId) abortRecording(recording);
  };

  const cleanupStalePartials = () => {
    for (const project of projectStore.list()) {
      let mediaDirectory;
      try {
        mediaDirectory = pathModule.join(projectStore.directoryFor(project.id), 'media');
      } catch {
        continue;
      }
      try {
        if (!fsModule.existsSync(mediaDirectory)) continue;
        for (const name of fsModule.readdirSync(mediaDirectory)) {
          if (!name.endsWith('.voiceover.partial')) continue;
          fsModule.rmSync(pathModule.join(mediaDirectory, name), { force: true });
        }
      } catch (error) {
        console.warn(`[Beam voice-over] Unable to remove stale partials in ${mediaDirectory}:`, error);
      }
    }
  };

  return { abort, begin, cleanupOwner, cleanupStalePartials, finalize, write };
}

function registerProjectVoiceoverIpc({ ipcMain, storage }) {
  const ownerId = (event) => event.sender.id;
  ipcMain.handle('projects:voiceover-begin', (event, payload) => storage.begin(ownerId(event), payload));
  ipcMain.handle('projects:voiceover-write', (event, payload) => storage.write(ownerId(event), payload));
  ipcMain.handle('projects:voiceover-finalize', (event, payload) => storage.finalize(ownerId(event), payload));
  ipcMain.handle('projects:voiceover-abort', (event, payload = {}) =>
    storage.abort(ownerId(event), payload.recordingId),
  );
}

module.exports = { createProjectVoiceoverStorage, registerProjectVoiceoverIpc, voiceoverFormat };
