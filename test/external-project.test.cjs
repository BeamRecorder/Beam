const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { externalProject, completeNativeScreenshot } = require('../electron/lifecycle/external-project.cjs');

const id = '00000000-0000-0000-0000-000000000001';

test('accepts only a typed capture identifier', () => {
  assert.deepEqual(externalProject(['beam', `--beam-open-project=video:${id}`]), { kind: 'video', id });
  assert.deepEqual(externalProject(['beam', `--beam-open-project=screenshot:${id}`]), { kind: 'screenshot', id });
  for (const bad of ['', 'video:../../escape', `other:${id}`, 'video:not-a-uuid'])
    assert.equal(externalProject(['beam', `--beam-open-project=${bad}`]), null);
});

test('native screenshots receive the active editor preset exactly once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-external-screenshot-'));
  const file = path.join(root, 'screenshot.json');
  const screenshotStore = { directoryFor: (candidate) => candidate === id ? root : assert.fail('unexpected project id') };
  const presetStore = { read: () => ({ activePresetId: 'selected', presets: [
    { id: 'other', settings: { editor: { kind: 'other' }, export: { format: 'png' } } },
    { id: 'selected', settings: { editor: { kind: 'selected' }, export: { format: 'webp' } } },
  ] }) };
  try {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, id, width: 100, height: 80 }));
    completeNativeScreenshot({ kind: 'screenshot', id }, screenshotStore, presetStore);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).preset.editor.kind, 'selected');
    const saved = fs.readFileSync(file, 'utf8');
    completeNativeScreenshot({ kind: 'screenshot', id }, screenshotStore, presetStore);
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing native screenshot metadata is surfaced to the caller', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-external-screenshot-'));
  try {
    assert.throws(() => completeNativeScreenshot({ kind: 'screenshot', id }, { directoryFor: () => root }, { read: () => ({}) }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
