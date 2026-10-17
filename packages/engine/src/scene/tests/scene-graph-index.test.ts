import { expect, it } from 'vitest';
import { createSceneGraphIndex } from '../scene-graph-index';
import { group } from './scene-fixtures';

it('indexes an empty hierarchy without inventing roots or parents', () => {
  const index = createSceneGraphIndex({ version: 1, roots: [], groups: [] });
  expect(index.groups.size).toBe(0);
  expect(index.parents.size).toBe(0);
  expect(index.declaredRoots.size).toBe(0);
  expect(index.roots).toEqual([]);
});

it('keeps authored root order and nested ownership, including arbitrary identifier strings', () => {
  const outer = group('outer', ['inner', '__proto__']);
  const inner = group('inner', ['constructor']);
  const roots = ['free', 'outer'];
  const index = createSceneGraphIndex({ version: 1, roots, groups: [outer, inner] });
  expect(index.roots).toBe(roots);
  expect([...index.declaredRoots]).toEqual(roots);
  expect([...index.parents]).toEqual([
    ['inner', 'outer'],
    ['__proto__', 'outer'],
    ['constructor', 'inner'],
  ]);
  expect(index.groups.get('inner')).toBe(inner);
  expect(index.parents.has('free')).toBe(false);
});

it('gives edited hierarchies independent indexes without changing the previous ownership', () => {
  const first = createSceneGraphIndex({ version: 1, roots: ['g'], groups: [group('g', ['a'])] });
  const second = createSceneGraphIndex({ version: 1, roots: ['h'], groups: [group('h', ['a'])] });
  expect(first.parents.get('a')).toBe('g');
  expect(second.parents.get('a')).toBe('h');
  expect(first.groups.has('h')).toBe(false);
  expect(second.declaredRoots.has('g')).toBe(false);
});
