const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore, defaults, normalize } = require('../../electron/preferences/preferences-store.cjs');

const CANONICAL_HUD_WINDOW = { width: 352, height: 512 };

test('writes durable generic preferences and merges patches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  const saved = store.patch({
    theme: 'dark',
    shortcuts: { 'hud.startStopRecording': { keys: 'Ctrl+Shift+R', scope: 'global', category: 'hud' } },
    extras: { futureFlag: true },
  });
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.shortcuts['hud.startStopRecording'].keys, 'Ctrl+Shift+R');
  assert.equal(saved.extras.futureFlag, true);
  assert.deepEqual(store.read(), saved);
  assert.ok(fs.existsSync(path.join(directory, 'preferencesSettings.json')));
});

test('writes camera and teleprompter window coordinates to preferences.json', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const file = path.join(directory, 'preferences.json');
  const store = createPreferencesStore(file);
  const bounds = {
    cameraOverlay: { x: 321, y: 222, width: 500, height: 300 },
    teleprompterWindow: { x: 355, y: 277, width: 800, height: 500 },
  };

  store.patch({ extras: bounds });

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).extras, bounds);
  assert.deepEqual(store.read().extras, bounds);
});

test('rejects duplicate global shortcuts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  assert.throws(
    () =>
      store.write({
        ...store.read(),
        shortcuts: {
          a: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
          b: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
        },
      }),
    /dupliqué/,
  );
});

test('repair returns safe runtime preferences for duplicate global shortcuts without rewriting the file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-duplicate-shortcuts-'));
  const file = path.join(directory, 'preferences.json');
  const store = createPreferencesStore(file, { platform: 'darwin' });
  const original = {
    theme: 'dark',
    devices: { cameraId: 'camera-1', micId: 'mic-1' },
    extras: { locale: 'fr', marker: 'preserve-me' },
    shortcuts: {
      first: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
      second: { keys: 'Ctrl+F', scope: 'global', category: 'editor' },
    },
  };
  const originalContents = JSON.stringify(original);
  fs.writeFileSync(file, originalContents);

  const repaired = store.repair();

  assert.equal(repaired.theme, 'dark');
  assert.deepEqual(repaired.devices, original.devices);
  assert.deepEqual(repaired.extras, original.extras);
  assert.deepEqual(repaired.shortcuts, defaults('darwin').shortcuts);
  assert.equal(fs.readFileSync(file, 'utf8'), originalContents);

  assert.throws(() => store.patch({ extras: { changed: true } }), /dupliqué/);
  assert.equal(fs.readFileSync(file, 'utf8'), originalContents);
});

test('accepts hover-only recorder visibility and falls back for invalid values', () => {
  assert.equal(normalize({ recordingBar: { visibility: 'hover-only' } }).recordingBar.visibility, 'hover-only');
  assert.equal(normalize({ recordingBar: { visibility: 'not-a-mode' } }, 'win32').recordingBar.visibility, 'always');
  assert.equal(
    normalize({ recordingBar: { visibility: 'not-a-mode' } }, 'linux').recordingBar.visibility,
    'hover-only',
  );
});

test('uses hover-only defaults on Linux and always-visible defaults on desktop platforms', () => {
  assert.equal(defaults('linux').recordingBar.visibility, 'hover-only');
  assert.equal(defaults('win32').recordingBar.visibility, 'always');
  assert.equal(defaults('darwin').recordingBar.visibility, 'always');
  assert.equal(normalize({}, 'linux').recordingBar.visibility, 'hover-only');
  assert.equal(normalize({}, 'win32').recordingBar.visibility, 'always');
  assert.equal(normalize({}, 'darwin').recordingBar.visibility, 'always');
});

test('exposes canonical HUD window dimensions in defaults and normalized preferences', () => {
  assert.deepEqual(defaults().hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(defaults('darwin').hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(normalize({}).hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(
    normalize({ hudWindow: { width: 352, height: 512, unexpected: 'discarded' } }).hudWindow,
    CANONICAL_HUD_WINDOW,
  );
});

test('normalizes missing, partial, malformed, and unexpected HUD window sizes exactly', () => {
  const invalidSizes = [
    null,
    {},
    { width: 352 },
    { height: 512 },
    { width: undefined, height: 512 },
    { width: 352, height: undefined },
    { width: 351, height: 512 },
    { width: 352, height: 511 },
    { width: 352.5, height: 512 },
    { width: 352, height: '512' },
    { width: '352', height: 512 },
    { width: 0, height: 0 },
    { width: -352, height: -512 },
    { width: 352, height: 512, scale: 2 },
    [352, 512],
    '352x512',
    true,
  ];

  for (const hudWindow of invalidSizes) {
    assert.deepEqual(normalize({ hudWindow }).hudWindow, CANONICAL_HUD_WINDOW, JSON.stringify(hudWindow));
  }
});

test('repair rewrites preferences.json with canonical HUD dimensions and preserves valid preferences', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-hud-window-'));
  const file = path.join(directory, 'preferences.json');
  const store = createPreferencesStore(file, { platform: 'darwin' });
  const original = {
    theme: 'dark',
    appearance: {
      theme: 'dark',
      primaryColor: '#8b5cf6',
      secondaryColor: '#06b6d4',
      radiusPx: 16,
      isPillRadius: false,
      surfaceTone: 'slate',
      activePresetId: 'cyber-violet',
    },
    hudWindow: { width: 640, height: 900, staleScale: 2 },
    recordingBar: { visibility: 'always' },
    devices: { cameraId: 'camera-1', micId: 'mic-1' },
    extras: { locale: 'fr', hudPosition: { x: 42, y: 84 } },
  };
  fs.writeFileSync(file, JSON.stringify(original));

  const repaired = store.repair();
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.deepEqual(repaired.hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(persisted.hudWindow, CANONICAL_HUD_WINDOW);
  assert.equal(persisted.theme, 'dark');
  assert.equal(persisted.appearance.primaryColor, '#8b5cf6');
  assert.equal(persisted.appearance.surfaceTone, 'slate');
  assert.deepEqual(persisted.devices, original.devices);
  assert.deepEqual(persisted.extras, original.extras);
});

test('repair creates missing preferences and quarantines malformed JSON before writing defaults', () => {
  const missingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-hud-window-missing-'));
  const missingFile = path.join(missingDirectory, 'preferences.json');
  const missingStore = createPreferencesStore(missingFile, { platform: 'darwin' });

  assert.deepEqual(missingStore.repair().hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(JSON.parse(fs.readFileSync(missingFile, 'utf8')).hudWindow, CANONICAL_HUD_WINDOW);
  assert.equal(fs.existsSync(`${missingFile}.invalid`), false);

  const malformedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-hud-window-malformed-'));
  const malformedFile = path.join(malformedDirectory, 'preferences.json');
  const malformedContents = '{broken';
  fs.writeFileSync(malformedFile, malformedContents);
  const malformedStore = createPreferencesStore(malformedFile, { platform: 'darwin' });

  const repaired = malformedStore.repair();
  const quarantinedFile = `${malformedFile}.invalid`;

  assert.deepEqual(repaired, defaults('darwin'));
  assert.equal(fs.readFileSync(quarantinedFile, 'utf8'), malformedContents);
  assert.deepEqual(JSON.parse(fs.readFileSync(malformedFile, 'utf8')), defaults('darwin'));
});

test('repair returns normalized preferences when writing the temporary file fails without replacing the original', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-repair-write-failure-'));
  const file = path.join(directory, 'preferences.json');
  const store = createPreferencesStore(file, { platform: 'darwin' });
  const original = {
    theme: 'dark',
    hudWindow: { width: 640, height: 900 },
    devices: { cameraId: 'camera-1' },
    extras: { marker: 'preserve-me' },
  };
  const originalContents = JSON.stringify(original);
  fs.writeFileSync(file, originalContents);
  const writeFileSync = fs.writeFileSync;
  let attempted = false;
  fs.writeFileSync = (destination, ...args) => {
    if (destination === `${file}.tmp`) {
      attempted = true;
      throw new Error('temporary preferences write failed');
    }
    return writeFileSync(destination, ...args);
  };

  let repaired;
  try {
    repaired = store.repair();
  } finally {
    fs.writeFileSync = writeFileSync;
  }

  assert.equal(attempted, true);
  assert.equal(repaired.theme, 'dark');
  assert.deepEqual(repaired.hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(repaired.devices, original.devices);
  assert.deepEqual(repaired.extras, original.extras);
  assert.equal(fs.readFileSync(file, 'utf8'), originalContents);
});

test('repair returns normalized preferences when atomic rename fails without replacing the original', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-repair-rename-failure-'));
  const file = path.join(directory, 'preferences.json');
  const store = createPreferencesStore(file, { platform: 'darwin' });
  const original = {
    theme: 'dark',
    hudWindow: { width: 640, height: 900 },
    devices: { micId: 'mic-1' },
    extras: { marker: 'preserve-me' },
  };
  const originalContents = JSON.stringify(original);
  fs.writeFileSync(file, originalContents);
  const renameSync = fs.renameSync;
  let attempted = false;
  fs.renameSync = (source, destination) => {
    if (destination === file) {
      attempted = true;
      throw new Error('atomic preferences rename failed');
    }
    return renameSync(source, destination);
  };

  let repaired;
  try {
    repaired = store.repair();
  } finally {
    fs.renameSync = renameSync;
    fs.rmSync(`${file}.tmp`, { force: true });
  }

  assert.equal(attempted, true);
  assert.equal(repaired.theme, 'dark');
  assert.deepEqual(repaired.hudWindow, CANONICAL_HUD_WINDOW);
  assert.deepEqual(repaired.devices, original.devices);
  assert.deepEqual(repaired.extras, original.extras);
  assert.equal(fs.readFileSync(file, 'utf8'), originalContents);
});

test('preserves an explicit recorder visibility preference on Linux', () => {
  for (const visibility of ['always', 'auto-fade', 'hover-only']) {
    assert.equal(normalize({ recordingBar: { visibility } }, 'linux').recordingBar.visibility, visibility);
  }
});

test('defaults spell check to enabled and persists an explicit disabled preference', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-spell-check-'));
  const store = createPreferencesStore(directory);

  assert.deepEqual(store.read().spellCheck, { enabled: true });

  const saved = store.patch({ spellCheck: { enabled: false } });

  assert.deepEqual(saved.spellCheck, { enabled: false });
  assert.deepEqual(store.read().spellCheck, { enabled: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')).spellCheck, { enabled: false });
});

test('applies the injected platform default to missing and corrupt preference files', () => {
  const linuxStore = createPreferencesStore(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-linux-')), {
    platform: 'linux',
  });
  assert.equal(linuxStore.read().recordingBar.visibility, 'hover-only');

  const macStore = createPreferencesStore(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-mac-')), {
    platform: 'darwin',
  });
  assert.equal(macStore.read().recordingBar.visibility, 'always');

  const preserved = linuxStore.patch({ recordingBar: { visibility: 'always' } });
  assert.equal(preserved.recordingBar.visibility, 'always');
  assert.equal(linuxStore.patch({ theme: 'dark' }).recordingBar.visibility, 'always');

  fs.writeFileSync(linuxStore.file, '{broken');
  assert.equal(linuxStore.read().recordingBar.visibility, 'hover-only');
});

test('migrates interaction recording preferences and validates booleans', () => {
  const migrated = normalize({ schemaVersion: 2, theme: 'dark' });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.recordingInteractions, { enabled: false, noticeDismissed: false });

  const normalized = normalize({
    recordingInteractions: { enabled: true, noticeDismissed: true },
  });
  assert.deepEqual(normalized.recordingInteractions, { enabled: true, noticeDismissed: true });
  assert.deepEqual(normalize({ recordingInteractions: { enabled: 'yes', noticeDismissed: 1 } }).recordingInteractions, {
    enabled: false,
    noticeDismissed: false,
  });
});

test('merges interaction preference patches without erasing sibling state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  store.patch({ recordingInteractions: { noticeDismissed: true } });
  const saved = store.patch({ recordingInteractions: { enabled: true } });
  assert.deepEqual(saved.recordingInteractions, { enabled: true, noticeDismissed: true });
});

test('defaults voice-over countdown and project monitoring preferences', () => {
  assert.deepEqual(defaults().voiceover, { countdownSeconds: 3, monitorProjectAudio: false });
  assert.deepEqual(normalize({ schemaVersion: 2 }).voiceover, {
    countdownSeconds: 3,
    monitorProjectAudio: false,
  });
});

test('normalizes invalid voice-over preference values and accepts supported countdowns', () => {
  for (const countdownSeconds of [0, 3, 5, 10]) {
    assert.equal(normalize({ voiceover: { countdownSeconds } }).voiceover.countdownSeconds, countdownSeconds);
  }

  const normalized = normalize({
    voiceover: { countdownSeconds: 4, monitorProjectAudio: 'yes' },
  });
  assert.deepEqual(normalized.voiceover, { countdownSeconds: 3, monitorProjectAudio: false });
  assert.equal(
    normalize({ voiceover: { countdownSeconds: NaN, monitorProjectAudio: true } }).voiceover.countdownSeconds,
    3,
  );
  assert.equal(
    normalize({ voiceover: { countdownSeconds: 10, monitorProjectAudio: true } }).voiceover.monitorProjectAudio,
    true,
  );
});

test('merges and persists partial voice-over preference patches without erasing sibling state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-voiceover-'));
  const store = createPreferencesStore(directory);

  store.patch({ voiceover: { monitorProjectAudio: true } });
  const saved = store.patch({ voiceover: { countdownSeconds: 10 } });

  assert.deepEqual(saved.voiceover, { countdownSeconds: 10, monitorProjectAudio: true });
  assert.deepEqual(store.read().voiceover, saved.voiceover);
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')).voiceover, saved.voiceover);
});

test('normalizes and patches appearance customizer settings properly', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-appearance-'));
  const store = createPreferencesStore(directory);
  const initial = store.read();
  assert.ok(initial.appearance);
  assert.equal(initial.appearance.primaryColor, '#ff5a1f');
  assert.equal(initial.appearance.radiusPx, 10);
  assert.equal(initial.appearance.surfaceTone, 'default');

  const patched = store.patch({
    appearance: {
      primaryColor: '#8b5cf6',
      secondaryColor: '#06b6d4',
      radiusPx: 16,
      isPillRadius: false,
      surfaceTone: 'slate',
      activePresetId: 'cyber-violet',
    },
  });

  assert.equal(patched.appearance.primaryColor, '#8b5cf6');
  assert.equal(patched.appearance.secondaryColor, '#06b6d4');
  assert.equal(patched.appearance.radiusPx, 16);
  assert.equal(patched.appearance.surfaceTone, 'slate');
  assert.equal(patched.appearance.activePresetId, 'cyber-violet');

  // Verify sync when root theme changes
  const themePatched = store.patch({ theme: 'dark' });
  assert.equal(themePatched.theme, 'dark');
  assert.equal(themePatched.appearance.theme, 'dark');
  assert.equal(themePatched.appearance.primaryColor, '#8b5cf6');
});
