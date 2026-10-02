const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const creator = path.resolve('scripts/performance/create-timeline-stress.mjs');
const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-stress-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'project-source');
  fs.mkdirSync(source);
  const manifest = {
    projectId: 'original',
    name: 'Original',
    sessions: [{ sessionId: 'recording', relativePath: 'session-recording' }],
    previewSrc: pathToFileURL(path.join(source, 'session-recording', 'screen.mp4')).href,
    editor: {
      zoom: { elements: [{ id: 'zoom' }] },
      composition: {
        assets: [
          {
            id: 'screen',
            durationMs: 7503,
            src: path.join(source, 'media.webm'),
            sessionId: 'recording',
            sessionPath: 'screen.mp4',
          },
        ],
        clips: [
          { id: 'screen', kind: 'screen', assetId: 'screen', trackId: 'screen-lane', enabled: false },
          { id: 'blur', kind: 'blur', mode: 'blur', enabled: false, feather: 14, strength: 30 },
        ],
      },
    },
  };
  const original = JSON.stringify(manifest);
  fs.writeFileSync(path.join(source, 'project.json'), original);
  fs.writeFileSync(path.join(source, 'media.webm'), 'real-media-placeholder-for-copy-test');
  fs.mkdirSync(path.join(source, 'session-recording'));
  fs.writeFileSync(path.join(source, 'session-recording', 'screen.mp4'), 'recording-copy-fixture');
  return { root, source, original };
};
const create = (source, target, count, mode) => {
  execFileSync(process.execPath, [creator, source, target, String(count), mode], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(target, 'project.json'), 'utf8'));
};

test('creates independent deterministic 10000-effect projects without altering the original', (t) => {
  const { root, source, original } = fixture(t);
  const first = create(source, path.join(root, 'first'), 10000, 'random');
  const second = create(source, path.join(root, 'second'), 10000, 'random');
  assert.notEqual(first.projectId, second.projectId);
  assert.notEqual(first.projectId, 'original');
  const effects = (project) => project.editor.composition.clips.filter((clip) => clip.kind === 'blur');
  assert.equal(effects(first).length, 10000);
  const geometry = (clip) => [clip.timelineStartMs, clip.timelineDurationMs, clip.transform];
  assert.deepEqual(effects(first).map(geometry), effects(second).map(geometry));
  assert.equal(new Set(effects(first).map((clip) => clip.trackId)).size, 10000);
  for (const clip of effects(first)) {
    assert.equal(clip.enabled, true);
    assert.equal(clip.strength, 30);
    assert.ok(clip.timelineStartMs + clip.timelineDurationMs <= 60000);
  }
  assert.equal(fs.readFileSync(path.join(source, 'project.json'), 'utf8'), original);
  assert.equal(first.editor.composition.assets[0].src, path.join(root, 'first', 'media.webm'));
  assert.equal(first.previewSrc, pathToFileURL(path.join(root, 'first', 'session-recording', 'screen.mp4')).href);
  assert.equal(fs.readFileSync(path.join(root, 'first', 'media.webm'), 'utf8'), 'real-media-placeholder-for-copy-test');
});

test('keeps every simultaneous effect enabled for the entire minute and repeats real media', (t) => {
  const { root, source } = fixture(t);
  const project = create(source, path.join(root, 'simultaneous'), 2000, 'simultaneous');
  const effects = project.editor.composition.clips.filter((clip) => clip.kind === 'blur');
  assert.equal(effects.length, 2000);
  assert.ok(effects.every((clip) => clip.timelineStartMs === 0 && clip.timelineDurationMs === 60000 && clip.enabled));
  const screens = project.editor.composition.clips.filter((clip) => clip.kind === 'screen');
  assert.equal(
    screens.reduce((sum, clip) => sum + clip.timelineDurationMs, 0),
    60000,
  );
  assert.ok(screens.every((clip) => clip.sourceInMs === 0 && clip.sourceDurationMs === clip.timelineDurationMs));
  assert.deepEqual(project.editor.zoom.elements, []);
});

test('rejects existing destinations and invalid counts before writing anything', (t) => {
  const { root, source, original } = fixture(t);
  assert.throws(() => create(source, source, 10, 'random'));
  const nested = path.join(source, 'nested');
  assert.throws(() => create(source, nested, 10, 'random'));
  assert.equal(fs.existsSync(nested), false);
  for (const count of [0, -1, 10001, 1.5, NaN]) {
    const target = path.join(root, `invalid-${count}`);
    assert.throws(() => create(source, target, count, 'random'));
    assert.equal(fs.existsSync(target), false);
  }
  assert.equal(fs.readFileSync(path.join(source, 'project.json'), 'utf8'), original);
});
