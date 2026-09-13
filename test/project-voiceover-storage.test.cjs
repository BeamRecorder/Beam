const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createProjectVoiceoverStorage } = require('../electron/projects/project-voiceover-storage.cjs');

const projectId = '11111111-1111-4111-8111-111111111111';
const ownerId = 17;
const sourceId = 'microphone:chromium:device-1';
const format = { codec: 'opus', sampleRate: 48_000, channels: 2 };

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-voiceover-'));
  const projectDirectory = path.join(root, 'project');
  fs.mkdirSync(projectDirectory, { recursive: true });
  const projectStore = {
    directoryFor: (id) => {
      if (id !== projectId) throw new Error('Projet introuvable');
      return projectDirectory;
    },
    list: () => [{ id: projectId }],
    mediaUrlFor: (fileUrl) => {
      const file = new URL(fileUrl);
      const relative = path.relative(root, file.pathname);
      return `project-media://asset/${encodeURIComponent(relative.split(path.sep).join('/'))}`;
    },
  };
  return {
    root,
    projectDirectory,
    mediaDirectory: path.join(projectDirectory, 'media'),
    storage: createProjectVoiceoverStorage({ projectStore }),
  };
}

function removeFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test('writes ordered chunks to a partial and publishes one project asset atomically', () => {
  const value = fixture();
  try {
    const opened = value.storage.begin(ownerId, { projectId, sourceId, format });
    assert.equal(fs.readdirSync(value.mediaDirectory).filter((name) => name.endsWith('.voiceover.partial')).length, 1);
    assert.equal(fs.readdirSync(value.mediaDirectory).filter((name) => name.endsWith('.webm')).length, 0);

    value.storage.write(ownerId, { recordingId: opened.recordingId, sequence: 0, data: new Uint8Array([1, 2]) });
    value.storage.write(ownerId, { recordingId: opened.recordingId, sequence: 1, data: new Uint8Array([3, 4]) });
    const asset = value.storage.finalize(ownerId, { recordingId: opened.recordingId, name: '  Take one  ' });

    assert.equal(asset.kind, 'audio');
    assert.equal(asset.origin, 'project');
    assert.equal(asset.name, 'Take one');
    assert.equal(asset.fileName.endsWith('.webm'), true);
    assert.match(asset.src, /^project-media:\/\/asset\//);
    assert.deepEqual(fs.readFileSync(path.join(value.mediaDirectory, asset.fileName)), Buffer.from([1, 2, 3, 4]));
    assert.equal(
      fs.readdirSync(value.mediaDirectory).some((name) => name.endsWith('.voiceover.partial')),
      false,
    );
  } finally {
    removeFixture(value.root);
  }
});

test('rejects invalid source and format before opening a recording', () => {
  const value = fixture();
  try {
    assert.throws(
      () => value.storage.begin(ownerId, { projectId, sourceId: 'microphone:other:device-1', format }),
      /microphone source/,
    );
    assert.throws(
      () =>
        value.storage.begin(ownerId, {
          projectId,
          sourceId,
          format: { codec: 'pcm', sampleRate: 48_000, channels: 2 },
        }),
      /format/,
    );
    assert.throws(
      () =>
        value.storage.begin(ownerId, { projectId, sourceId, format: { codec: 'opus', sampleRate: -1, channels: 2 } }),
      /sampleRate/,
    );
    assert.equal(fs.existsSync(value.mediaDirectory), false);
  } finally {
    removeFixture(value.root);
  }
});

test('enforces recording ownership, chunk sequence, and non-empty chunks', () => {
  const value = fixture();
  try {
    const opened = value.storage.begin(ownerId, { projectId, sourceId, format });
    assert.throws(
      () =>
        value.storage.write(ownerId + 1, { recordingId: opened.recordingId, sequence: 0, data: new Uint8Array([1]) }),
      /authorized/,
    );
    assert.throws(
      () => value.storage.write(ownerId, { recordingId: opened.recordingId, sequence: 1, data: new Uint8Array([1]) }),
      /sequence/,
    );
    assert.throws(
      () => value.storage.write(ownerId, { recordingId: opened.recordingId, sequence: 0, data: new Uint8Array() }),
      /chunk size/,
    );
    value.storage.write(ownerId, { recordingId: opened.recordingId, sequence: 0, data: new Uint8Array([9]) });
  } finally {
    removeFixture(value.root);
  }
});

test('rejects an empty finalize and removes its partial file', () => {
  const value = fixture();
  try {
    const opened = value.storage.begin(ownerId, { projectId, sourceId, format });
    assert.throws(() => value.storage.finalize(ownerId, { recordingId: opened.recordingId }), /no audio data/);
    assert.equal(fs.readdirSync(value.mediaDirectory).length, 0);
    assert.throws(() => value.storage.abort(ownerId, opened.recordingId), /not found/);
  } finally {
    removeFixture(value.root);
  }
});

test('aborts owner jobs and removes stale partials without touching unrelated files', () => {
  const value = fixture();
  try {
    const aborted = value.storage.begin(ownerId, { projectId, sourceId, format });
    value.storage.write(ownerId, { recordingId: aborted.recordingId, sequence: 0, data: new Uint8Array([1]) });
    value.storage.abort(ownerId, aborted.recordingId);
    assert.equal(fs.readdirSync(value.mediaDirectory).length, 0);

    const owned = value.storage.begin(ownerId + 1, { projectId, sourceId, format });
    value.storage.write(ownerId + 1, { recordingId: owned.recordingId, sequence: 0, data: new Uint8Array([2]) });
    value.storage.cleanupOwner(ownerId + 1);
    assert.equal(fs.readdirSync(value.mediaDirectory).length, 0);

    fs.writeFileSync(path.join(value.mediaDirectory, 'crashed.webm.old.voiceover.partial'), Buffer.from([3]));
    fs.writeFileSync(path.join(value.mediaDirectory, 'keep.partial'), Buffer.from([4]));
    value.storage.cleanupStalePartials();
    assert.equal(fs.existsSync(path.join(value.mediaDirectory, 'crashed.webm.old.voiceover.partial')), false);
    assert.equal(fs.existsSync(path.join(value.mediaDirectory, 'keep.partial')), true);
  } finally {
    removeFixture(value.root);
  }
});
