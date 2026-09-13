const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { safeExportName } = require('../export/export-ipc.cjs');

const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const invalid = () => {
  throw new Error('Invalid transcript export.');
};
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
const time = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nullableId = (value) => value === null || (text(value, 600) && value.length > 0);

function transcriptJson(value) {
  if (
    !record(value) ||
    value.format !== 'beam-transcript' ||
    value.schemaVersion !== 1 ||
    value.timeUnit !== 'ms' ||
    !time(value.timelineDurationMs) ||
    !text(value.text, MAX_TRANSCRIPT_BYTES) ||
    !Array.isArray(value.segments) ||
    !value.segments.length ||
    value.segments.length > 100_000
  )
    invalid();
  let wordCount = 0;
  const segments = Array.from(value.segments, (segment) => {
    if (
      !record(segment) ||
      !text(segment.clipId, 600) ||
      !segment.clipId ||
      !nullableId(segment.sentenceId) ||
      !nullableId(segment.captionLayerId) ||
      typeof segment.isAiGenerated !== 'boolean' ||
      !text(segment.text, MAX_TRANSCRIPT_BYTES) ||
      !segment.text.trim() ||
      !time(segment.startMs) ||
      !time(segment.endMs) ||
      segment.endMs <= segment.startMs ||
      segment.endMs > value.timelineDurationMs ||
      !Array.isArray(segment.words)
    )
      invalid();
    wordCount += segment.words.length;
    if (wordCount > 1_000_000) invalid();
    const words = Array.from(segment.words, (word) => {
      if (
        !record(word) ||
        !text(word.text, MAX_TRANSCRIPT_BYTES) ||
        !word.text.trim() ||
        !time(word.startMs) ||
        !time(word.endMs) ||
        word.endMs < word.startMs ||
        word.startMs < segment.startMs ||
        word.endMs > segment.endMs
      )
        invalid();
      return { text: word.text, startMs: word.startMs, endMs: word.endMs };
    });
    return {
      clipId: segment.clipId,
      sentenceId: segment.sentenceId,
      captionLayerId: segment.captionLayerId,
      isAiGenerated: segment.isAiGenerated,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      words,
    };
  });
  const json = `${JSON.stringify(
    {
      format: 'beam-transcript',
      schemaVersion: 1,
      timeUnit: 'ms',
      timelineDurationMs: value.timelineDurationMs,
      text: value.text,
      segments,
    },
    null,
    2,
  )}\n`;
  if (Buffer.byteLength(json, 'utf8') > MAX_TRANSCRIPT_BYTES) invalid();
  return json;
}

function registerTranscriptExportIpc({ ipcMain, dialog, BrowserWindow, defaultExportDirectory, fsModule = fs }) {
  ipcMain.handle('captions:export-transcript', async (event, payload = {}) => {
    if (!record(payload) || !text(payload.projectName, 600)) invalid();
    const json = transcriptJson(payload.transcript);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed()) throw new Error('Transcript export window unavailable.');
    const fileName = safeExportName(`${payload.projectName} transcript`, 'json');
    const result = await dialog.showSaveDialog(owner, {
      title: 'Export transcript',
      defaultPath: defaultExportDirectory ? path.join(defaultExportDirectory, fileName) : fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const targetPath = path.resolve(result.filePath);
    if (path.extname(targetPath).toLowerCase() !== '.json')
      throw new Error('The transcript file must use the .json extension.');
    const temporaryPath = `${targetPath}.${randomUUID()}.partial`;
    let temporaryWritten = false;
    try {
      await fsModule.promises.writeFile(temporaryPath, json, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      temporaryWritten = true;
      await fsModule.promises.rename(temporaryPath, targetPath);
    } catch (error) {
      if (temporaryWritten || error.code !== 'EEXIST')
        await fsModule.promises.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return { canceled: false, path: targetPath };
  });
}

module.exports = { registerTranscriptExportIpc };
