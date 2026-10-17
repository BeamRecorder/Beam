import type { SceneGraph } from './scene-types';
import type { SceneGraphIndex } from './scene-graph-index-types';

/** Capture hierarchy once per immutable document; animation replaces group values only. */
export function createSceneGraphIndex(graph: SceneGraph): SceneGraphIndex {
  return {
    groups: new Map(graph.groups.map((group) => [group.id, group])),
    parents: new Map(graph.groups.flatMap((group) => group.children.map((child) => [child, group.id] as const))),
    roots: graph.roots,
    declaredRoots: new Set(graph.roots),
  };
}
