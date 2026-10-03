const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore } = require('../../apps/desktop/electron/preferences/preferences-store.cjs');

test('existing preference files do not opt into an experimental video backend', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-video-export-preference-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'preferences.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 3, extras: { locale: 'fr' } }));
  const store = createPreferencesStore(file, { platform: 'linux' });
  assert.equal(store.read().extras.videoExportBackend, undefined);
  assert.equal(store.read().extras.locale, 'fr');
});

for (const backend of ['ffmpeg-vaapi', 'webcodecs']) {
  test(`persists ${backend} across preference store restarts and unrelated changes`, (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-video-export-preference-'));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'preferences.json');
    const store = createPreferencesStore(file, { platform: 'linux' });
    store.patch({ extras: { locale: 'fr', videoExportBackend: backend } });
    const restarted = createPreferencesStore(file, { platform: 'linux' });
    assert.equal(restarted.read().extras.videoExportBackend, backend);
    restarted.patch({ extras: { timelineInsertOnDoubleClick: true } });
    const next = createPreferencesStore(file, { platform: 'linux' }).read();
    assert.equal(next.extras.videoExportBackend, backend);
    assert.equal(next.extras.locale, 'fr');
    assert.equal(next.extras.timelineInsertOnDoubleClick, true);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).extras.videoExportBackend, backend);
  });
}
