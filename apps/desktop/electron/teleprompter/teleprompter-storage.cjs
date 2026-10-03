const { readJsonSync, writeJsonAtomicSync } = require('@beam/storage/node/json-file');
const fs = require('fs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 1_000_000;

const assertId = (value, name) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Identifiant ${name} invalide`);
  return value;
};

const assertObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document téléprompteur invalide');
  return value;
};

const numberInRange = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

function normalizeTeleprompterDocument(value, now = new Date().toISOString()) {
  const input = assertObject(value);
  if (input.schemaVersion !== 1) throw new Error('Version du document téléprompteur invalide');
  if (typeof input.text !== 'string' || input.text.length > MAX_TEXT_LENGTH)
    throw new Error('Texte téléprompteur invalide');
  if (!['continuous', 'line-by-line'].includes(input.mode)) throw new Error('Mode téléprompteur invalide');
  if (typeof input.autoscroll !== 'boolean') throw new Error('Autoscroll téléprompteur invalide');
  if (!['left', 'center'].includes(input.textAlign)) throw new Error('Alignement téléprompteur invalide');
  if (!['system', 'light', 'dark'].includes(input.theme)) throw new Error('Thème téléprompteur invalide');
  const updatedAtUtc =
    typeof input.updatedAtUtc === 'string' && !Number.isNaN(Date.parse(input.updatedAtUtc)) ? input.updatedAtUtc : now;
  return {
    schemaVersion: 1,
    text: input.text,
    mode: input.mode,
    autoscroll: input.autoscroll,
    scrollSpeed: numberInRange(input.scrollSpeed, 42, 5, 200),
    // Keep the reader compact so the fixed playback bar remains visible.
    fontSize: Math.round(numberInRange(input.fontSize, 36, 16, 36)),
    lineHeight: numberInRange(input.lineHeight, 1.35, 1, 2.5),
    textAlign: input.textAlign,
    theme: input.theme,
    textColor: typeof input.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.textColor) ? input.textColor : null,
    windowOpacity: numberInRange(input.windowOpacity, 1, 0.2, 1),
    updatedAtUtc,
  };
}

function createTeleprompterStorage({ projectStore, fsModule = fs }) {
  const fileFor = (projectId, sessionId) => {
    assertId(projectId, 'projet');
    assertId(sessionId, 'session');
    const file = projectStore.teleprompterFileFor(projectId, sessionId);
    if (!file) throw new Error('Session introuvable');
    return file;
  };
  const save = (projectId, sessionId, value) => {
    const file = fileFor(projectId, sessionId);
    const document = normalizeTeleprompterDocument(value);
    writeJsonAtomicSync(file, document, { fsModule });
    return document;
  };
  const get = (projectId, sessionId) => {
    const file = fileFor(projectId, sessionId);
    if (!fsModule.existsSync(file)) return null;
    let value;
    try {
      value = readJsonSync(file, { fsModule });
    } catch (error) {
      throw new Error(`Document téléprompteur illisible : ${error instanceof Error ? error.message : String(error)}`);
    }
    return normalizeTeleprompterDocument(value);
  };
  return { save, get, fileFor };
}

module.exports = {
  MAX_TEXT_LENGTH,
  normalizeTeleprompterDocument,
  createTeleprompterStorage,
};
