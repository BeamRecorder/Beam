import type { ProjectComposition } from "./composition-types";

/** Removes a selected clip and, while it is linked, its paired sidecars. */
export function deleteCompositionLayer(
  composition: ProjectComposition,
  layerId: string,
): ProjectComposition {
  const selected = composition.layers.find((layer) => layer.id === layerId);
  if (!selected) return composition;
  const ids = selected.groupId
    ? new Set(composition.layers.filter((layer) => layer.groupId === selected.groupId).map((layer) => layer.id))
    : new Set([layerId]);
  return { ...composition, layers: composition.layers.filter((layer) => !ids.has(layer.id)) };
}
