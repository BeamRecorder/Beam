import type { SceneGroup } from './scene-types';

/** Derived topology owned by a scene resolver, never persisted in the document. */
export interface SceneGraphIndex {
  groups: ReadonlyMap<string, SceneGroup>;
  parents: ReadonlyMap<string, string>;
  roots: readonly string[];
  declaredRoots: ReadonlySet<string>;
}
