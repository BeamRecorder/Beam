const fs = require('node:fs');

const PROJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function externalProject(commandLine) {
  const raw = (commandLine || []).find((value) => value.startsWith('--beam-open-project='));
  if (!raw) return null;
  const match = /^(video|screenshot):(.+)$/.exec(raw.slice('--beam-open-project='.length));
  return match && PROJECT.test(match[2]) ? { kind: match[1], id: match[2] } : null;
}

/** Fills the native screenshot document with Electron's active editor preset. */
function completeNativeScreenshot(project, screenshotStore, presetStore) {
  if (project.kind !== 'screenshot') return;
  const file = `${screenshotStore.directoryFor(project.id)}/screenshot.json`;
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (document.preset?.editor && document.preset?.export) return;
  const presets = presetStore.read();
  const active = presets.presets.find((item) => item.id === presets.activePresetId) ?? presets.presets[0];
  if (!active) throw new Error('Screenshot editor preset unavailable');
  const temporary = `${file}.native.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...document, preset: active.settings }), { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

module.exports = { externalProject, completeNativeScreenshot };
