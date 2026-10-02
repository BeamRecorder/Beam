const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeComposition, migrateComposition } = require('../apps/desktop/electron/projects/clip-composition.cjs');
const document = () => ({
  schemaVersion: 14,
  assets: [],
  keyboardCaptionSessions: [],
  clips: [
    {
      id: 'color',
      name: 'Color',
      kind: 'color',
      assetId: '',
      trackId: 'color',
      timelineStartMs: 0,
      timelineDurationMs: 1000,
      sourceInMs: 0,
      sourceDurationMs: 1000,
      playbackRate: 1,
      order: 0,
      enabled: true,
      fill: { kind: 'color', color: '#ff0000' },
      transform: { x: 0, y: 0, width: 1, height: 1 },
      transitions: { entry: null, exit: null },
    },
  ],
  scene: {
    version: 1,
    roots: ['group'],
    groups: [
      {
        id: 'group',
        children: ['color'],
        space: 'scene',
        transform: { x: 0.1, y: 0.2, scaleX: 0.8, scaleY: 0.9, rotation: 10 },
        opacity: 0.5,
        blendMode: 'source-over',
        timing: { startMs: 100, rate: 2 },
        mask: { shape: 'ellipse', x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  },
  animations: {
    version: 1,
    tracks: [
      {
        id: 'move',
        targetId: 'color',
        property: 'transform.x',
        interpolation: 'number',
        keyframes: [
          { timeMs: 0, value: 0 },
          { timeMs: 1000, value: 1 },
        ],
      },
    ],
  },
});
test('Electron reopens persisted nested scenes and keyframes without dropping metadata', () => {
  const initial = document();
  const saved = normalizeComposition(initial);
  const reopened = migrateComposition(JSON.parse(JSON.stringify(saved)), false);
  assert.deepEqual(reopened.scene, initial.scene);
  assert.deepEqual(reopened.animations, initial.animations);
  initial.scene.groups[0].transform.x = 99;
  initial.animations.tracks[0].keyframes[0].value = 99;
  assert.equal(reopened.scene.groups[0].transform.x, 0.1);
  assert.equal(reopened.animations.tracks[0].keyframes[0].value, 0);
});
test('flat schema-14 compositions remain flat with the same timing and layering', () => {
  const initial = document();
  delete initial.scene;
  delete initial.animations;
  const reopened = migrateComposition(initial, false);
  assert.equal(reopened.scene, undefined);
  assert.equal(reopened.animations, undefined);
  assert.equal(reopened.clips[0].timelineStartMs, 0);
  assert.equal(reopened.clips[0].timelineDurationMs, 1000);
  assert.equal(reopened.clips[0].order, 0);
});
test('Electron rejects invalid graphs and executable-looking property paths at the save boundary', () => {
  const cyclic = document();
  cyclic.scene.groups[0].children = ['group'];
  assert.throws(() => normalizeComposition(cyclic), /cycle/);
  const polluted = document();
  polluted.animations.tracks[0].property = '__proto__.polluted';
  assert.throws(() => normalizeComposition(polluted), /property/);
  const duplicate = document();
  duplicate.scene.roots.push('group');
  assert.throws(() => normalizeComposition(duplicate), /duplicate/);
  assert.equal({}.polluted, undefined);
});
