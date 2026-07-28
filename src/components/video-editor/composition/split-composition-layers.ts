import type { CompositionLayer, ProjectComposition } from './composition-types'
import { splitSessionAtTimeline } from './base-video-ranges'

type IdFactory = () => string

/**
 * Splits every timeline layer crossing `atMs`.
 *
 * A linked video/audio pair becomes two linked pairs: its right-hand clips
 * receive a new group id so subsequent edits do not also move the left half.
 */
export function splitCompositionLayersAt(
  composition: ProjectComposition,
  atMs: number,
  baseDurationMs: number,
  idFactory: IdFactory = () => crypto.randomUUID(),
): ProjectComposition {
  const cutMs = Math.round(atMs)
  if (!Number.isFinite(cutMs)) return composition

  const nextComposition = splitSessionAtTimeline(composition, cutMs, baseDurationMs)

  const targetIds = new Set(
    composition.layers
      .filter((layer) => layer.startMs < cutMs && cutMs < layer.endMs)
      .map((layer) => layer.id),
  )
  if (targetIds.size === 0) return nextComposition

  const rightGroupIds = new Map<string, string>()
  const rightLayerIds = new Map<string, string>()
  const splitLayer = (layer: CompositionLayer): CompositionLayer[] => {
    if (!targetIds.has(layer.id)) return [layer]

    const rightId = idFactory()
    rightLayerIds.set(layer.id, rightId)
    const elapsedMs = cutMs - layer.startMs
    const rightGroupId = layer.groupId
      ? (rightGroupIds.get(layer.groupId) ?? rightGroupIds.set(layer.groupId, idFactory()).get(layer.groupId))
      : undefined
    const right = {
      ...layer,
      id: rightId,
      startMs: cutMs,
      ...(rightGroupId ? { groupId: rightGroupId } : {}),
      ...(layer.kind === 'caption'
        ? {}
        : { sourceOffsetMs: (layer.sourceOffsetMs ?? 0) + Math.round(elapsedMs * (layer.playbackRate ?? 1)) }),
    } as CompositionLayer
    return [{ ...layer, endMs: cutMs }, right]
  }

  const layers = composition.layers.flatMap(splitLayer).map((layer, order) => ({ ...layer, order }))
  const visualTrackOrder = composition.visualTrackOrder?.flatMap((id) => {
    const rightId = rightLayerIds.get(id)
    return rightId ? [id, rightId] : [id]
  })

  return {
    ...nextComposition,
    layers,
    ...(visualTrackOrder ? { visualTrackOrder } : {}),
  }
}
