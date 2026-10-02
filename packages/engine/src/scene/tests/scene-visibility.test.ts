import { expect, it } from 'vitest';
import { mayBeEnabled } from '../scene-visibility';
import { compileSceneComposition } from '../scene-clock';
import { sceneDocument } from './scene-fixtures';
it('keeps static visible clips and omits unanimated hidden ones', () => {
  const doc = sceneDocument(),
    clip = doc.clips[0]!;
  expect(mayBeEnabled(null, clip)).toBe(true);
  clip.enabled = false;
  expect(mayBeEnabled(null, clip)).toBe(false);
  expect(mayBeEnabled(doc, clip)).toBe(false);
  expect(mayBeEnabled(doc, clip)).toBe(false);
});
it('prepares hidden clips with a future visibility keyframe in nested clocks', () => {
  const doc = sceneDocument();
  doc.clips[0]!.enabled = false;
  doc.animations!.tracks = [
    {
      id: 'enable',
      targetId: 'a',
      property: 'enabled',
      interpolation: 'discrete',
      keyframes: [
        { timeMs: 0, value: false },
        { timeMs: 500, value: true },
      ],
    },
  ];
  const compiled = compileSceneComposition(doc);
  expect(mayBeEnabled(compiled, compiled.clips[0]!)).toBe(true);
});
it('does not prepare tracks that never enable their target', () => {
  const doc = sceneDocument();
  doc.clips[0]!.enabled = false;
  delete doc.animations;
  expect(mayBeEnabled(doc, doc.clips[0]!)).toBe(false);
  const other = sceneDocument();
  other.clips[0]!.enabled = false;
  other.animations!.tracks = [
    {
      id: 'enable',
      targetId: 'a',
      property: 'enabled',
      interpolation: 'discrete',
      keyframes: [{ timeMs: 0, value: false }],
    },
  ];
  expect(mayBeEnabled(other, other.clips[0]!)).toBe(false);
});
