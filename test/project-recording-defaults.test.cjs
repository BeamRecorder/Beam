const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');

function recording(t, cursorEmbedded) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-recording-defaults-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectId = randomUUID();
  const sessionId = randomUUID();
  const directory = path.join(root, 'project-recording');
  const sessionDirectory = path.join(directory, `session-${sessionId}`);
  fs.mkdirSync(sessionDirectory, { recursive: true });
  // Native create_or_update_project writes a typed ProjectEditorState with
  // zoom only; it has never been opened or saved by the editor.
  const project = {
    schemaVersion: 2,
    projectId,
    name: 'Recording',
    createdAtUtc: '2026-10-07T00:00:00Z',
    updatedAtUtc: '2026-10-07T00:00:00Z',
    sessions: [{ sessionId, relativePath: `session-${sessionId}` }],
    editor: { zoom: { elements: [], generatedSessions: [] } },
  };
  const manifest = {
    schemaVersion: 2,
    projectId,
    sessionId,
    createdAtUtc: project.createdAtUtc,
    durationNs: 1_000_000_000,
    platform: { os: 'windows', architecture: 'x86_64', backend: 'windows-graphics-capture' },
    selectedSources: {},
    tracks: [],
    completed: true,
    ...(cursorEmbedded === undefined ? {} : { cursorEmbedded }),
  };
  const projectFile = path.join(directory, 'project.json');
  fs.writeFileSync(projectFile, JSON.stringify(project));
  fs.writeFileSync(path.join(sessionDirectory, 'manifest.json'), JSON.stringify(manifest));
  return { store: createProjectStore(root), projectId, project, projectFile };
}

for (const embedded of [true, false, undefined]) {
  test(`recognizes a native recording as fresh and forwards its cursor metadata (${embedded})`, (t) => {
    const { store, projectId, projectFile } = recording(t, embedded);
    assert.equal(store.editorData(projectId).manifest.cursorEmbedded, embedded);
    assert.equal(store.editorState(projectId).isFresh, true);
    assert.equal(store.editorState(projectId).isFresh, true);
    assert.equal(JSON.parse(fs.readFileSync(projectFile, 'utf8')).editor.applyGlobalDefaults, true);
  });
}

for (const enabled of [false, true]) {
  test(`consumes native recording defaults once and preserves the saved cursor choice (${enabled})`, (t) => {
    const { store, projectId } = recording(t, true);
    const state = store.editorState(projectId);
    assert.equal(state.isFresh, true);
    state.presentation.cursor.enabled = enabled;
    assert.equal(store.saveEditorState(projectId, state).isFresh, false);
    assert.equal(store.editorState(projectId).presentation.cursor.enabled, enabled);
    assert.equal(store.editorState(projectId).isFresh, false);
  });
}

test('does not reinitialize an already saved project or a migrated presentation', (t) => {
  const { store, projectId, projectFile, project } = recording(t, true);
  const state = store.editorState(projectId);
  state.presentation.cursor.enabled = true;
  store.saveEditorState(projectId, state);
  assert.equal(store.editorState(projectId).isFresh, false);
  project.editor = { schemaVersion: 2, zoom: project.editor.zoom, presentation: state.presentation };
  fs.writeFileSync(projectFile, JSON.stringify(project));
  assert.equal(store.editorState(projectId).isFresh, false);
  assert.equal(store.editorState(projectId).presentation.cursor.enabled, true);
});
