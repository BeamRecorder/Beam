import { expect, it, vi } from 'vitest';
import { createCompositionSceneLayerResolver } from '../scene-layers';
import { sceneDocument, group } from '../../scene/tests/scene-fixtures';

it('retains topology across playback frames without rereading group memberships', () => {
  const doc = sceneDocument();
  const resolver = createCompositionSceneLayerResolver(doc);
  const map = vi.spyOn(doc.scene!.groups, 'map');
  const index = resolver(0).sceneIndex;
  for (let frame = 1; frame < 240; frame++) expect(resolver((frame * 1000) / 240).sceneIndex).toBe(index);
  expect(map).not.toHaveBeenCalled();
  expect(index?.parents.get('a')).toBe('g');
});

it('shares topology while supplying the current animated group values', () => {
  const doc = sceneDocument();
  doc.animations!.tracks = [
    {
      id: 'move-group',
      targetId: 'g',
      property: 'transform.x',
      interpolation: 'number',
      keyframes: [
        { timeMs: 0, value: 0 },
        { timeMs: 1000, value: 0.5 },
      ],
    },
  ];
  const resolver = createCompositionSceneLayerResolver(doc);
  const first = resolver(0),
    next = resolver(500);
  expect(first.sceneIndex?.parents).toBe(next.sceneIndex?.parents);
  expect(first.sceneIndex?.declaredRoots).toBe(next.sceneIndex?.declaredRoots);
  expect(first.sceneIndex?.groups.get('g')?.transform.x).toBe(0);
  expect(next.sceneIndex?.groups.get('g')?.transform.x).toBe(0.25);
  expect(next.sceneIndex?.groups.get('g')).toBe(next.scene?.groups[0]);
  expect(doc.scene!.groups[0]!.transform.x).toBe(0);
});

it('rebuilds membership after a document edit, and omits the index for flat compositions', () => {
  const doc = sceneDocument();
  const before = createCompositionSceneLayerResolver(doc)(500);
  const changed = { ...doc, scene: { version: 1 as const, roots: ['new'], groups: [group('new')] } };
  const after = createCompositionSceneLayerResolver(changed)(500);
  expect(before.sceneIndex?.parents.get('a')).toBe('g');
  expect(after.sceneIndex?.parents.get('a')).toBe('new');
  const { scene: _scene, ...flat } = doc;
  expect(createCompositionSceneLayerResolver(flat)(500).sceneIndex).toBeUndefined();
});
