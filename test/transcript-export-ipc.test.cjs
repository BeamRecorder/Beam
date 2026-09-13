const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerTranscriptExportIpc } = require('../electron/captions/transcript-export-ipc.cjs');
const { safeExportName } = require('../electron/export/export-ipc.cjs');

const CHANNEL = 'captions:export-transcript';

function sparseArray(length) {
  const values = [];
  values.length = length;
  return values;
}

function validTranscript() {
  return {
    format: 'beam-transcript',
    schemaVersion: 1,
    timeUnit: 'ms',
    timelineDurationMs: 500,
    text: 'Hello, café 世界 👋',
    extraDocumentField: 'must not be exported',
    segments: [
      {
        clipId: 'caption-1',
        sentenceId: 'sentence-1',
        captionLayerId: null,
        isAiGenerated: true,
        text: 'Hello, café 世界 👋',
        startMs: 100,
        endMs: 300,
        extraSegmentField: 'must not be exported',
        words: [
          { text: 'Hello,', startMs: 100, endMs: 180, extraWordField: true },
          { text: '世界 👋', startMs: 180, endMs: 300 },
          { text: 'boundary', startMs: 300, endMs: 300 },
        ],
      },
    ],
  };
}

function makeFsFixture({ failureStage = null } = {}) {
  const calls = { writeFile: [], rename: [], unlink: [] };
  const failure = new Error(`simulated ${failureStage} failure`);
  const fsModule = {
    promises: {
      writeFile: async (filePath, data, options) => {
        calls.writeFile.push({ filePath, data, options });
        if (failureStage === 'write') {
          await fs.promises.writeFile(filePath, 'incomplete transcript', options);
          throw failure;
        }
        return fs.promises.writeFile(filePath, data, options);
      },
      rename: async (fromPath, toPath) => {
        calls.rename.push({ fromPath, toPath });
        if (failureStage === 'rename') throw failure;
        return fs.promises.rename(fromPath, toPath);
      },
      unlink: async (filePath) => {
        calls.unlink.push(filePath);
        return fs.promises.unlink(filePath);
      },
    },
  };
  return { calls, failure, fsModule };
}

function makeFixture(root, options = {}) {
  const handlers = new Map();
  const calls = { dialogs: [], senders: [] };
  const owner = { isDestroyed: () => options.ownerDestroyed === true };
  const sender = { id: 7 };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const dialog = {
    showSaveDialog: async (window, dialogOptions) => {
      calls.dialogs.push({ window, options: dialogOptions });
      return (
        options.dialogResult ?? {
          canceled: false,
          filePath: options.filePath ?? path.join(root, 'transcript.json'),
        }
      );
    },
  };
  const BrowserWindow = {
    fromWebContents: (webContents) => {
      calls.senders.push(webContents);
      return options.ownerMissing ? null : owner;
    },
  };
  const registration = { ipcMain, dialog, BrowserWindow };
  if (Object.hasOwn(options, 'defaultExportDirectory'))
    registration.defaultExportDirectory = options.defaultExportDirectory;
  if (options.fsModule) registration.fsModule = options.fsModule;
  registerTranscriptExportIpc(registration);

  return {
    calls,
    dialog,
    owner,
    sender,
    invoke: (payload = { projectName: 'Demo', transcript: validTranscript() }) => {
      const handler = handlers.get(CHANNEL);
      assert.ok(handler, `Missing IPC handler ${CHANNEL}`);
      return handler({ sender }, payload);
    },
  };
}

function createRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('exports normalized JSON atomically with Unicode, a final newline, and a private file mode', async (t) => {
  const root = createRoot('beam-transcript-export-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'transcript.json');
  const fsFixture = makeFsFixture();
  const fixture = makeFixture(root, { fsModule: fsFixture.fsModule });
  const transcript = validTranscript();

  assert.deepEqual(await fixture.invoke({ projectName: 'Demo', transcript }), { canceled: false, path: target });
  const normalized = {
    format: 'beam-transcript',
    schemaVersion: 1,
    timeUnit: 'ms',
    timelineDurationMs: 500,
    text: 'Hello, café 世界 👋',
    segments: [
      {
        clipId: 'caption-1',
        sentenceId: 'sentence-1',
        captionLayerId: null,
        isAiGenerated: true,
        text: 'Hello, café 世界 👋',
        startMs: 100,
        endMs: 300,
        words: [
          { text: 'Hello,', startMs: 100, endMs: 180 },
          { text: '世界 👋', startMs: 180, endMs: 300 },
          { text: 'boundary', startMs: 300, endMs: 300 },
        ],
      },
    ],
  };
  const expected = `${JSON.stringify(normalized, null, 2)}\n`;
  assert.deepEqual(fs.readFileSync(target), Buffer.from(expected, 'utf8'));
  assert.equal(fs.readFileSync(target, 'utf8').endsWith('\n'), true);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.equal(fsFixture.calls.writeFile.length, 1);
  assert.deepEqual(fsFixture.calls.writeFile[0].options, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  assert.match(
    fsFixture.calls.writeFile[0].filePath,
    /^.+\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.partial$/,
  );
  assert.deepEqual(fsFixture.calls.rename, [{ fromPath: fsFixture.calls.writeFile[0].filePath, toPath: target }]);
  assert.deepEqual(fs.readdirSync(root), ['transcript.json']);
});

test('parents the JSON save dialog and defaults to the sanitized transcript filename', async (t) => {
  const root = createRoot('beam-transcript-dialog-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const defaultExportDirectory = path.join(root, 'exports');
  const fixture = makeFixture(root, { defaultExportDirectory, dialogResult: { canceled: true } });
  const sender = fixture.sender;

  assert.deepEqual(await fixture.invoke({ projectName: ' Café:/demo ', transcript: validTranscript() }), {
    canceled: true,
  });
  assert.deepEqual(fixture.calls.senders, [sender]);
  assert.equal(fixture.calls.dialogs.length, 1);
  assert.equal(fixture.calls.dialogs[0].window, fixture.owner);
  assert.deepEqual(fixture.calls.dialogs[0].options, {
    title: 'Export transcript',
    defaultPath: path.join(defaultExportDirectory, safeExportName(' Café:/demo  transcript', 'json')),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['showOverwriteConfirmation'],
  });
  assert.deepEqual(fs.readdirSync(root), []);
});

test('a canceled save dialog never creates a temporary file', async (t) => {
  const root = createRoot('beam-transcript-cancel-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fsFixture = makeFsFixture();
  const fixture = makeFixture(root, {
    dialogResult: { canceled: true },
    fsModule: fsFixture.fsModule,
  });

  assert.deepEqual(await fixture.invoke(), { canceled: true });
  assert.equal(fixture.calls.dialogs.length, 1);
  assert.deepEqual(fsFixture.calls.writeFile, []);
  assert.deepEqual(fsFixture.calls.rename, []);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('rejects malformed transcript data before showing a save dialog', async (t) => {
  const root = createRoot('beam-transcript-invalid-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = makeFixture(root);
  const invalidCases = [
    ['non-string project name', { projectName: 4, transcript: validTranscript() }],
    ['unsupported format', { projectName: 'Demo', transcript: { ...validTranscript(), format: 'other' } }],
    ['wrong schema version', { projectName: 'Demo', transcript: { ...validTranscript(), schemaVersion: 2 } }],
    [
      'invalid timeline duration',
      { projectName: 'Demo', transcript: { ...validTranscript(), timelineDurationMs: Infinity } },
    ],
    ['non-string transcript text', { projectName: 'Demo', transcript: { ...validTranscript(), text: null } }],
    ['empty segments', { projectName: 'Demo', transcript: { ...validTranscript(), segments: [] } }],
    ['sparse segments', { projectName: 'Demo', transcript: { ...validTranscript(), segments: sparseArray(1) } }],
    [
      'sparse words',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], words: sparseArray(1) }] },
      },
    ],
    [
      'non-string clip ID',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], clipId: 3 }] },
      },
    ],
    [
      'non-string sentence ID',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], sentenceId: 3 }] },
      },
    ],
    [
      'non-boolean AI marker',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], isAiGenerated: 'yes' }] },
      },
    ],
    [
      'blank segment text',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], text: '  ' }] },
      },
    ],
    [
      'negative segment timestamp',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], startMs: -1 }] },
      },
    ],
    [
      'non-finite segment timestamp',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], endMs: NaN }] },
      },
    ],
    [
      'zero-length segment',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], endMs: 100 }] },
      },
    ],
    [
      'segment after timeline duration',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [{ ...validTranscript().segments[0], endMs: 501 }],
        },
      },
    ],
    [
      'non-array words',
      {
        projectName: 'Demo',
        transcript: { ...validTranscript(), segments: [{ ...validTranscript().segments[0], words: null }] },
      },
    ],
    [
      'blank word text',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [
            {
              ...validTranscript().segments[0],
              words: [{ text: ' ', startMs: 100, endMs: 100 }],
            },
          ],
        },
      },
    ],
    [
      'word with negative timestamp',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [
            {
              ...validTranscript().segments[0],
              words: [{ text: 'word', startMs: -1, endMs: 100 }],
            },
          ],
        },
      },
    ],
    [
      'word end before start',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [
            {
              ...validTranscript().segments[0],
              words: [{ text: 'word', startMs: 200, endMs: 199 }],
            },
          ],
        },
      },
    ],
    [
      'word before its segment',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [
            {
              ...validTranscript().segments[0],
              words: [{ text: 'word', startMs: 99, endMs: 100 }],
            },
          ],
        },
      },
    ],
    [
      'word after its segment',
      {
        projectName: 'Demo',
        transcript: {
          ...validTranscript(),
          segments: [
            {
              ...validTranscript().segments[0],
              words: [{ text: 'word', startMs: 300, endMs: 301 }],
            },
          ],
        },
      },
    ],
  ];

  for (const [label, payload] of invalidCases) {
    await assert.rejects(fixture.invoke(payload), { message: 'Invalid transcript export.' }, label);
  }
  assert.equal(fixture.calls.dialogs.length, 0);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('rejects oversized documents and excessive segment or word counts before the dialog', async (t) => {
  const root = createRoot('beam-transcript-limits-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = makeFixture(root);
  const base = validTranscript();
  const segment = base.segments[0];
  const oversized = { ...base, text: 'x'.repeat(16 * 1024 * 1024) };
  const tooManySegments = { ...base, segments: Array.from({ length: 100_001 }, () => segment) };
  const tooManyWords = {
    ...base,
    segments: [{ ...segment, words: sparseArray(1_000_001) }],
  };

  for (const transcript of [oversized, tooManySegments, tooManyWords]) {
    await assert.rejects(fixture.invoke({ projectName: 'Demo', transcript }), {
      message: 'Invalid transcript export.',
    });
  }
  assert.equal(fixture.calls.dialogs.length, 0);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('rejects a non-JSON extension before creating a temporary file', async (t) => {
  const root = createRoot('beam-transcript-extension-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fsFixture = makeFsFixture();
  const target = path.join(root, 'transcript.txt');
  const fixture = makeFixture(root, { filePath: target, fsModule: fsFixture.fsModule });

  await assert.rejects(fixture.invoke(), /\.json extension/i);
  assert.equal(fixture.calls.dialogs.length, 1);
  assert.deepEqual(fsFixture.calls.writeFile, []);
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('rejects requests from a missing or destroyed BrowserWindow before opening the dialog', async (t) => {
  const root = createRoot('beam-transcript-window-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const options of [{ ownerDestroyed: true }, { ownerMissing: true }]) {
    const fixture = makeFixture(root, options);
    await assert.rejects(fixture.invoke(), /window unavailable/i);
    assert.equal(fixture.calls.senders.length, 1);
    assert.equal(fixture.calls.dialogs.length, 0);
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test('leaves a colliding temporary file intact when exclusive creation fails', async (t) => {
  const root = createRoot('beam-transcript-collision-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fsFixture = makeFsFixture();
  const writeFile = fsFixture.fsModule.promises.writeFile;
  fsFixture.fsModule.promises.writeFile = async (filePath, data, options) => {
    await fs.promises.writeFile(filePath, 'existing content');
    return writeFile(filePath, data, options);
  };
  const fixture = makeFixture(root, { fsModule: fsFixture.fsModule });

  await assert.rejects(fixture.invoke(), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(fsFixture.calls.writeFile[0].filePath, 'utf8'), 'existing content');
  assert.deepEqual(fsFixture.calls.unlink, []);
  assert.deepEqual(fsFixture.calls.rename, []);
});

for (const failureStage of ['write', 'rename']) {
  test(`preserves an existing target and cleans the temporary file after ${failureStage} failure`, async (t) => {
    const root = createRoot(`beam-transcript-${failureStage}-failure-`);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const target = path.join(root, 'transcript.json');
    const original = Buffer.from('previous export');
    fs.writeFileSync(target, original);
    const fsFixture = makeFsFixture({ failureStage });
    const fixture = makeFixture(root, { fsModule: fsFixture.fsModule });

    await assert.rejects(fixture.invoke(), new RegExp(`simulated ${failureStage} failure`));
    assert.deepEqual(fs.readFileSync(target), original);
    assert.equal(fsFixture.calls.writeFile.length, 1);
    assert.equal(fsFixture.calls.rename.length, failureStage === 'rename' ? 1 : 0);
    assert.equal(fsFixture.calls.unlink.length, 1);
    assert.equal(fsFixture.calls.unlink[0], fsFixture.calls.writeFile[0].filePath);
    assert.deepEqual(fs.readdirSync(root), ['transcript.json']);
  });
}
