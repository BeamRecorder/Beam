const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fixture = () => ({
  projectId: 'original',
  name: 'Original',
  previewSrc: '/source/screen.webm',
  editor: {
    composition: {
      clips: [
        {
          id: 'video',
          kind: 'video',
          order: 200,
          timelineStartMs: 0,
          timelineDurationMs: 60000,
        },
        {
          id: 'blur',
          kind: 'blur',
          order: 100,
          timelineStartMs: 0,
          timelineDurationMs: 60000,
        },
        { id: 'shape', kind: 'shape' },
      ],
    },
    presentation: { canvas: { width: 1920, height: 1080 } },
  },
});
test('dense stress owns 10,000 editable, bounded outlines, distinct IDs and media order', async () => {
  const { denseShapeManifest } = await import('../scripts/performance/create-dense-shape-stress.mjs');
  const original = fixture(),
    text = JSON.stringify(original);
  const manifest = denseShapeManifest(text, '/source', '/destination');
  const second = denseShapeManifest(text, '/source', '/another');
  const clips = manifest.editor.composition.clips,
    shapes = clips.filter((c) => c.kind === 'shape');
  assert.equal(shapes.length, 10000);
  assert.equal(new Set(shapes.map((c) => c.id)).size, 10000);
  assert.notEqual(manifest.projectId, original.projectId);
  assert.equal(manifest.previewSrc, '/destination/screen.webm');
  assert.deepEqual(
    shapes.map((c) => c.transform),
    second.editor.composition.clips.filter((c) => c.kind === 'shape').map((c) => c.transform),
  );
  for (const clip of shapes) {
    assert.equal(clip.timelineDurationMs, 60000);
    assert.equal(clip.trackId, clip.id);
    assert.equal(clip.shadowEnabled, false);
    assert.equal(clip.opacityEnabled, false);
    assert.ok(clip.transform.x > 32 / 1920 && clip.transform.x + clip.transform.width < 1 - 32 / 1920);
    assert.ok(clip.transform.y > 32 / 1080 && clip.transform.y + clip.transform.height < 1 - 32 / 1080);
  }
  assert.equal(clips[0].id, 'video');
  assert.equal(clips[0].order, 10200);
  assert.equal(JSON.stringify(original), text);
});
test('invalid source fixtures are rejected before any project write', async () => {
  const { denseShapeManifest } = await import('../scripts/performance/create-dense-shape-stress.mjs');
  for (const kind of ['video', 'shape', 'blur']) {
    const source = fixture();
    source.editor.composition.clips = source.editor.composition.clips.filter((c) => c.kind !== kind);
    assert.throws(() => denseShapeManifest(JSON.stringify(source), '/source', '/new'), /source/);
  }
  const short = fixture();
  short.editor.composition.clips.forEach((c) => (c.timelineDurationMs = 15000));
  assert.throws(() => denseShapeManifest(JSON.stringify(short), '/source', '/new'), /minute/);
  const small = fixture();
  small.editor.presentation.canvas.width = 1280;
  assert.throws(() => denseShapeManifest(JSON.stringify(small), '/source', '/new'), /1920/);
});
test('the generator never overwrites an existing project or writes under its source', async (t) => {
  const { createDenseShapeStress } = await import('../scripts/performance/create-dense-shape-stress.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-dense-shape-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'project.json'), JSON.stringify(fixture()));
  fs.writeFileSync(path.join(source, 'screen.webm'), 'media-proof');
  assert.throws(() => createDenseShapeStress(source, source), /fresh/);
  assert.throws(() => createDenseShapeStress(source, path.join(source, 'child')), /fresh/);
  assert.throws(() => createDenseShapeStress(), /Usage/);
  const target = path.join(root, 'target'),
    result = createDenseShapeStress(source, target);
  assert.equal(result.clips, 10002);
  assert.equal(fs.readFileSync(path.join(target, 'screen.webm'), 'utf8'), 'media-proof');
  assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'project.json'))).projectId, 'original');
  assert.throws(() => createDenseShapeStress(source, target), /fresh/);
});
