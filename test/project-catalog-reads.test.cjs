const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-catalog-reads-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createProjectStore(root, { category: 'studio' });
  const project = store.create({ name: 'Session features' });
  const directory = store.directoryFor(project.id);
  const manifestFile = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const sessionId = 'session-one';
  const sessionDirectory = path.join(directory, 'sessions', sessionId);
  const assetPath = path.join(sessionDirectory, 'audio', 'imported.webm');
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(assetPath, 'audio');
  fs.mkdirSync(path.join(sessionDirectory, 'cursor'));
  fs.writeFileSync(path.join(sessionDirectory, 'cursor', 'input.json'), JSON.stringify({ events: [{ timeMs: 10 }] }));
  manifest.sessions = [{ sessionId, relativePath: path.join('sessions', sessionId) }];
  manifest.editor.composition = {
    assets: [{ id: 'session-audio', origin: 'session', sessionId, sessionPath: 'audio/imported.webm' }],
    clips: [
      { id: 'audio-one', kind: 'audio', role: 'microphone', assetId: 'session-audio' },
      { id: 'audio-two', kind: 'audio', role: 'system', assetId: 'session-audio' },
    ],
    keyboardCaptionSessions: [sessionId],
  };
  const writeManifest = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  writeManifest();
  const originalRead = fs.readFileSync;
  let manifestReads = 0;
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (file === manifestFile) manifestReads++;
    return originalRead.call(this, file, ...args);
  });
  return { root, store, manifest, manifestFile, writeManifest, assetPath, reads: () => manifestReads };
}

test('the first catalogue reads each project once while preserving session media and keyboard badges', (t) => {
  const value = fixture(t);
  const [project] = value.store.list();
  assert.equal(value.reads(), 1);
  assert.equal(project.hasMicrophone, true);
  assert.equal(project.hasSystemAudio, true);
  assert.equal(project.hasCaption, true);
});

test('a refreshed catalogue sees renamed projects and removed media without a retained manifest cache', (t) => {
  const value = fixture(t);
  value.store.list();
  value.manifest.name = 'Updated project';
  value.manifest.editor.composition.keyboardCaptionSessions = [];
  value.writeManifest();
  fs.rmSync(value.assetPath);
  const [project] = value.store.list();
  assert.equal(value.reads(), 2);
  assert.equal(project.name, 'Updated project');
  assert.equal(project.hasMicrophone, false);
  assert.equal(project.hasSystemAudio, false);
  assert.equal(project.hasCaption, false);
});

test('session asset paths still cannot escape a project while using the already loaded manifest', (t) => {
  const value = fixture(t);
  const external = path.join(value.root, 'external.webm');
  fs.writeFileSync(external, 'external audio');
  value.manifest.editor.composition.assets[0].sessionPath = '../../../../external.webm';
  value.writeManifest();
  const [project] = value.store.list();
  assert.equal(project.hasMicrophone, false);
  assert.equal(project.hasSystemAudio, false);
});
