const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { execFileSync } = require('node:child_process');
const creator = path.resolve('scripts/performance/create-mixed-gpu-stress.mjs');
const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-mixed-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  const manifest = {
    projectId: 'original',
    sessions: [{ sessionId: 'recording', relativePath: 'session' }],
    editor: {
      zoom: { elements: [] },
      composition: {
        assets: [
          {
            id: 'screen',
            durationMs: 7503,
            sessionId: 'recording',
            sessionPath: 'screen.mp4',
          },
          { id: 'video', durationMs: 5000, fileName: 'video.webm' },
        ],
        clips: [
          { kind: 'screen', assetId: 'screen', appearance: {} },
          { kind: 'video', assetId: 'video', appearance: {} },
          { kind: 'shape' },
          { kind: 'blur' },
        ],
      },
    },
  };
  const original = JSON.stringify(manifest);
  fs.writeFileSync(path.join(source, 'project.json'), original);
  fs.writeFileSync(path.join(source, 'video.webm'), 'copied-media-fixture');
  fs.mkdirSync(path.join(source, 'session'));
  fs.writeFileSync(path.join(source, 'session', 'screen.mp4'), 'copied-recording-fixture');
  return { source, root, original };
};
const create = (source, target) => {
  execFileSync(process.execPath, [creator, source, target], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(path.join(target, 'project.json'), 'utf8'));
};
test('creates independent mixed projects with all layers enabled for the full minute', (t) => {
  const { source, root, original } = fixture(t),
    target = path.join(root, 'mixed'),
    p = create(source, target),
    clips = p.editor.composition.clips;
  assert.notEqual(p.projectId, 'original');
  assert.equal(new Set(clips.filter((c) => c.kind === 'video').map((c) => c.trackId)).size, 64);
  assert.equal(clips.filter((c) => c.kind === 'shape').length, 128);
  assert.equal(clips.filter((c) => c.kind === 'blur').length, 64);
  assert.ok(clips.every((c) => c.enabled && c.timelineStartMs + c.timelineDurationMs <= 60000));
  assert.equal(fs.readFileSync(path.join(source, 'project.json'), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(target, 'video.webm'), 'utf8'), 'copied-media-fixture');
  assert.ok(p.previewSrc.includes('/mixed/session/screen.mp4'));
});
test('retains four independent source-time phases with contiguous source-valid fragments', (t) => {
  const { source, root } = fixture(t),
    p = create(source, path.join(root, 'mixed'));
  const tracks = new Map();
  for (const clip of p.editor.composition.clips.filter((c) => c.kind === 'video')) {
    if (!tracks.has(clip.trackId)) tracks.set(clip.trackId, []);
    tracks.get(clip.trackId).push(clip);
    assert.ok(clip.sourceInMs + clip.sourceDurationMs <= 5000);
    assert.ok(clip.timelineDurationMs >= 40);
  }
  assert.deepEqual(new Set([...tracks.values()].map((c) => c[0].sourceInMs)), new Set([0, 625, 1250, 1875]));
  for (const clips of tracks.values()) {
    let end = 0;
    for (const clip of clips) {
      assert.equal(clip.timelineStartMs, end);
      end += clip.timelineDurationMs;
    }
    assert.equal(end, 60000);
  }
});
test('rejects destructive destinations and missing/invalid source media before copying', (t) => {
  const { source, root } = fixture(t);
  assert.throws(() => create(source, source));
  assert.throws(() => create(source, path.join(source, 'nested')));
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'project.json'), 'utf8'));
  manifest.editor.composition.assets[1].durationMs = NaN;
  fs.writeFileSync(path.join(source, 'project.json'), JSON.stringify(manifest));
  const target = path.join(root, 'invalid');
  assert.throws(() => create(source, target));
  assert.equal(fs.existsSync(target), false);
});
