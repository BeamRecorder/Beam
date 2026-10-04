import type { ClipComposition } from '../shared/composition-types';

/** Hierarchy child/root order overrides legacy clip order when choosing the primary screen. */
export function scenePaintOrder(composition: ClipComposition): ReadonlyMap<string, number> | null {
  if (!composition.scene) return null;
  const ranks = new Map<string, number>();
  const groups = new Map(composition.scene.groups.map((group) => [group.id, group]));
  const visit = (id: string) => {
    const group = groups.get(id);
    if (group) for (const child of group.children) visit(child);
    else ranks.set(id, ranks.size);
  };
  for (const root of composition.scene.roots) visit(root);
  for (const clip of [...composition.clips].sort((a, b) => b.order - a.order))
    if (!ranks.has(clip.id)) ranks.set(clip.id, ranks.size);
  return ranks;
}
