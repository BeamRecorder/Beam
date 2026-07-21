import { COMPOSITION_SCHEMA_VERSION, MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, type Clip, type ClipComposition, type ClipGroup, type ClipKind, type ClipTransform, type IdFactory, type LegacyComposition } from './clip-types'

export class CompositionEngineError extends Error {}

const createId: IdFactory = () => crypto.randomUUID()
const finite = (value: number) => Number.isFinite(value)
const round = (value: number) => Math.round(value)
const clone = (composition: ClipComposition): ClipComposition => structuredClone(composition)
const clipById = (composition: ClipComposition, clipId: string) => {
  const clip = composition.clips.find((entry) => entry.id === clipId)
  if (!clip) throw new CompositionEngineError(`Unknown clip: ${clipId}`)
  return clip
}
const groupFor = (composition: ClipComposition, clipId: string) => composition.groups.find((group) => group.clipIds.includes(clipId))
const targetsFor = (composition: ClipComposition, clipId: string) => groupFor(composition, clipId)?.clipIds ?? [clipId]
const sorted = (clips: Clip[]) => [...clips].sort((left, right) => left.order - right.order).map((clip, order) => ({ ...clip, order }))
const durationFor = (clip: Clip, playbackRate: number) => round(clip.sourceDurationMs / playbackRate)

export function createComposition(clips: Clip[] = [], groups: ClipGroup[] = []): ClipComposition {
  const composition = { schemaVersion: COMPOSITION_SCHEMA_VERSION, clips: sorted(clips), groups: structuredClone(groups) } as ClipComposition
  validateComposition(composition)
  return composition
}

export function validateComposition(composition: ClipComposition): void {
  if (!composition || composition.schemaVersion !== COMPOSITION_SCHEMA_VERSION || !Array.isArray(composition.clips) || !Array.isArray(composition.groups)) throw new CompositionEngineError('Invalid composition schema.')
  const ids = new Set<string>()
  for (const clip of composition.clips) {
    if (!clip || !clip.id || ids.has(clip.id) || !['video', 'audio', 'image', 'webcam', 'annotation'].includes(clip.kind)) throw new CompositionEngineError('Invalid clip identity.')
    ids.add(clip.id)
    if (![clip.timelineStartMs, clip.timelineDurationMs, clip.sourceInMs, clip.sourceDurationMs, clip.playbackRate].every(finite) || clip.timelineStartMs < 0 || clip.timelineDurationMs <= 0 || clip.sourceInMs < 0 || clip.sourceDurationMs <= 0) throw new CompositionEngineError('Invalid clip timing.')
    if (clip.playbackRate < MIN_PLAYBACK_RATE || clip.playbackRate > MAX_PLAYBACK_RATE) throw new CompositionEngineError('Playback rate must be between 0.25x and 4x.')
    if ((clip.kind === 'annotation') !== (clip.annotationId !== null) || (clip.kind !== 'annotation' && clip.mediaId === null)) throw new CompositionEngineError('Invalid clip source.')
  }
  const grouped = new Set<string>()
  for (const group of composition.groups) {
    if (!group.id || group.clipIds.length < 2 || group.clipIds.some((id) => !ids.has(id) || grouped.has(id))) throw new CompositionEngineError('Invalid clip group.')
    group.clipIds.forEach((id) => grouped.add(id))
  }
}

export function sourceTimeAt(clip: Clip, timelineTimeMs: number): number | null {
  if (!finite(timelineTimeMs) || timelineTimeMs < clip.timelineStartMs || timelineTimeMs > clip.timelineStartMs + clip.timelineDurationMs) return null
  return round(clip.sourceInMs + (timelineTimeMs - clip.timelineStartMs) * clip.playbackRate)
}

export function activeClipsAt(composition: ClipComposition, timelineTimeMs: number): Clip[] {
  return composition.clips.filter((clip) => clip.enabled && sourceTimeAt(clip, timelineTimeMs) !== null).sort((left, right) => left.order - right.order)
}

export function moveClip(composition: ClipComposition, clipId: string, timelineStartMs: number): ClipComposition {
  if (!finite(timelineStartMs) || timelineStartMs < 0) throw new CompositionEngineError('Invalid timeline position.')
  const next = clone(composition); const source = clipById(next, clipId); const delta = round(timelineStartMs) - source.timelineStartMs
  for (const id of targetsFor(next, clipId)) clipById(next, id).timelineStartMs += delta
  return next
}

export function setPlaybackRate(composition: ClipComposition, clipId: string, playbackRate: number): ClipComposition {
  if (!finite(playbackRate) || playbackRate < MIN_PLAYBACK_RATE || playbackRate > MAX_PLAYBACK_RATE) throw new CompositionEngineError('Playback rate must be between 0.25x and 4x.')
  const next = clone(composition)
  for (const id of targetsFor(next, clipId)) { const clip = clipById(next, id); clip.playbackRate = playbackRate; clip.timelineDurationMs = durationFor(clip, playbackRate) }
  return next
}

export function trimClip(composition: ClipComposition, clipId: string, edge: 'start' | 'end', timelineTimeMs: number): ClipComposition {
  const next = clone(composition); const source = clipById(next, clipId)
  if (!finite(timelineTimeMs) || timelineTimeMs <= source.timelineStartMs || timelineTimeMs >= source.timelineStartMs + source.timelineDurationMs) throw new CompositionEngineError('Trim must be inside the clip.')
  const offset = round(timelineTimeMs) - source.timelineStartMs
  for (const id of targetsFor(next, clipId)) {
    const clip = clipById(next, id)
    if (edge === 'start') { clip.timelineStartMs += offset; clip.timelineDurationMs -= offset; clip.sourceInMs += round(offset * clip.playbackRate); clip.sourceDurationMs -= round(offset * clip.playbackRate) }
    else { clip.timelineDurationMs = offset; clip.sourceDurationMs = round(offset * clip.playbackRate) }
  }
  return next
}

export function splitClip(composition: ClipComposition, clipId: string, timelineTimeMs: number, idFactory: IdFactory = createId): ClipComposition {
  const next = clone(composition); const source = clipById(next, clipId)
  if (!finite(timelineTimeMs) || timelineTimeMs <= source.timelineStartMs || timelineTimeMs >= source.timelineStartMs + source.timelineDurationMs) throw new CompositionEngineError('Split must be inside the clip.')
  const originalGroup = groupFor(next, clipId); const targetIds = targetsFor(next, clipId); const offset = round(timelineTimeMs) - source.timelineStartMs
  const rightIds: string[] = []
  for (const id of targetIds) {
    const clip = clipById(next, id); const rightSourceDuration = clip.sourceDurationMs - round(offset * clip.playbackRate); const right: Clip = { ...clip, id: idFactory(), timelineStartMs: clip.timelineStartMs + offset, timelineDurationMs: clip.timelineDurationMs - offset, sourceInMs: clip.sourceInMs + round(offset * clip.playbackRate), sourceDurationMs: rightSourceDuration }
    clip.timelineDurationMs = offset; clip.sourceDurationMs -= rightSourceDuration; next.clips.push(right); rightIds.push(right.id)
  }
  if (originalGroup) { originalGroup.clipIds = [...targetIds]; next.groups.push({ id: idFactory(), clipIds: rightIds }) }
  return { ...next, clips: sorted(next.clips) }
}

export function setClipEnabled(composition: ClipComposition, clipId: string, enabled: boolean): ClipComposition {
  const next = clone(composition); clipById(next, clipId).enabled = Boolean(enabled); return next
}

export function deleteClip(composition: ClipComposition, clipId: string): ClipComposition {
  const next = clone(composition); clipById(next, clipId); next.clips = next.clips.filter((clip) => clip.id !== clipId)
  next.groups = next.groups.flatMap((group) => { const clipIds = group.clipIds.filter((id) => id !== clipId); return clipIds.length >= 2 ? [{ ...group, clipIds }] : [] })
  return { ...next, clips: sorted(next.clips) }
}

export function transformClip(composition: ClipComposition, clipId: string, transform: ClipTransform): ClipComposition {
  if (![transform.x, transform.y, transform.width, transform.height].every(finite) || transform.width <= 0 || transform.height <= 0) throw new CompositionEngineError('Invalid clip transform.')
  const next = clone(composition); const clip = clipById(next, clipId)
  if (clip.kind === 'audio') throw new CompositionEngineError('Audio clips do not have a visual transform.')
  clip.transform = { x: Math.max(0, Math.min(1, transform.x)), y: Math.max(0, Math.min(1, transform.y)), width: Math.max(.001, Math.min(1, transform.width)), height: Math.max(.001, Math.min(1, transform.height)) }
  return next
}

export function detachClip(composition: ClipComposition, clipId: string): ClipComposition {
  const next = clone(composition); const group = groupFor(next, clipId); if (!group) return next
  group.clipIds = group.clipIds.filter((id) => id !== clipId); next.groups = next.groups.filter((entry) => entry.clipIds.length >= 2); return next
}

export function attachClip(composition: ClipComposition, clipId: string, groupId: string): ClipComposition {
  const next = clone(composition); const clip = clipById(next, clipId); if (groupFor(next, clipId)) throw new CompositionEngineError('Clip is already linked.')
  const group = next.groups.find((entry) => entry.id === groupId); if (!group) throw new CompositionEngineError(`Unknown clip group: ${groupId}`)
  const anchor = clipById(next, group.clipIds[0])
  if (clip.timelineStartMs !== anchor.timelineStartMs || clip.timelineDurationMs !== anchor.timelineDurationMs || clip.playbackRate !== anchor.playbackRate) throw new CompositionEngineError('Clip timing is incompatible with this group.')
  group.clipIds.push(clipId); return next
}

export function migrateLegacyComposition(legacy: LegacyComposition): ClipComposition {
  const media = new Map(legacy.media.map((asset) => [asset.id, asset]))
  const clips = legacy.layers.map((layer) => {
    const asset = layer.assetId ? media.get(layer.assetId) : undefined; const kind: ClipKind = layer.kind === 'caption' ? 'annotation' : layer.kind === 'video' ? 'video' : layer.kind
    if (kind !== 'annotation' && !asset) throw new CompositionEngineError(`Missing media for legacy layer: ${layer.id}`)
    const duration = Math.max(1, round(layer.endMs - layer.startMs))
    return { id: layer.id, kind, mediaId: asset?.id ?? null, annotationId: kind === 'annotation' ? layer.id : null, timelineStartMs: Math.max(0, round(layer.startMs)), timelineDurationMs: duration, sourceInMs: 0, sourceDurationMs: kind === 'image' ? duration : Math.max(1, Math.min(asset?.durationMs ?? duration, duration)), playbackRate: 1, enabled: layer.enabled, order: layer.order, transform: layer.kind === 'audio' ? null : layer.transform ?? { x: 0, y: 0, width: 1, height: 1 } } satisfies Clip
  })
  return createComposition(clips)
}
