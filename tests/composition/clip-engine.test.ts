import { describe, expect, it } from 'vitest'
import { activeClipsAt, attachClip, CompositionEngineError, createComposition, deleteClip, detachClip, migrateLegacyComposition, moveClip, setClipEnabled, setPlaybackRate, sourceTimeAt, splitClip, transformClip, trimClip } from '../../src/components/video-editor/composition/engine/clip-engine'
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE, type Clip, type ClipComposition } from '../../src/components/video-editor/composition/engine/clip-types'

const clip = (id: string, kind: Clip['kind'] = 'video', overrides: Partial<Clip> = {}): Clip => ({ id, kind, mediaId: kind === 'annotation' ? null : `media-${id}`, annotationId: kind === 'annotation' ? `annotation-${id}` : null, timelineStartMs: 1_000, timelineDurationMs: 4_000, sourceInMs: 200, sourceDurationMs: 4_000, playbackRate: 1, enabled: true, order: 0, transform: kind === 'audio' ? null : { x: 0, y: 0, width: 1, height: 1 }, ...overrides })
const linked = (): ClipComposition => createComposition([clip('screen'), clip('camera', 'webcam'), clip('audio', 'audio')], [{ id: 'recording', clipIds: ['screen', 'camera', 'audio'] }])

describe('clip composition engine', () => {
  it('maps timeline times to source times and excludes times outside a clip', () => {
    const value = clip('a', 'video', { playbackRate: 2 })
    expect(sourceTimeAt(value, 1_000)).toBe(200)
    expect(sourceTimeAt(value, 1_500)).toBe(1_200)
    expect(sourceTimeAt(value, 5_001)).toBeNull()
  })

  it('returns only enabled active clips in render order', () => {
    const composition = createComposition([clip('back', 'image', { order: 2 }), clip('front', 'video', { order: 1 }), clip('hidden', 'audio', { enabled: false })])
    expect(activeClipsAt(composition, 1_100).map((entry) => entry.id)).toEqual(['front', 'back'])
    expect(activeClipsAt(composition, 500)).toEqual([])
  })

  it('moves every linked sidecar by the same delta', () => {
    const moved = moveClip(linked(), 'screen', 2_500)
    expect(moved.clips.map((entry) => entry.timelineStartMs)).toEqual([2_500, 2_500, 2_500])
  })

  it('changes speed for every linked sidecar and accepts a custom value', () => {
    const accelerated = setPlaybackRate(linked(), 'camera', 1.25)
    expect(accelerated.clips.every((entry) => entry.playbackRate === 1.25)).toBe(true)
    expect(accelerated.clips.every((entry) => entry.timelineDurationMs === 3_200)).toBe(true)
  })

  it('rejects non-finite and out-of-range custom speeds', () => {
    expect(() => setPlaybackRate(linked(), 'screen', Number.NaN)).toThrow(CompositionEngineError)
    expect(() => setPlaybackRate(linked(), 'screen', MIN_PLAYBACK_RATE - .01)).toThrow(/0.25x/)
    expect(() => setPlaybackRate(linked(), 'screen', MAX_PLAYBACK_RATE + .01)).toThrow(/4x/)
  })

  it('trims a linked group from its start while advancing each source', () => {
    const trimmed = trimClip(linked(), 'screen', 'start', 2_000)
    expect(trimmed.clips.map((entry) => [entry.timelineStartMs, entry.timelineDurationMs, entry.sourceInMs, entry.sourceDurationMs])).toEqual([[2_000, 3_000, 1_200, 3_000], [2_000, 3_000, 1_200, 3_000], [2_000, 3_000, 1_200, 3_000]])
  })

  it('trims a linked group from its end without changing source in', () => {
    const trimmed = trimClip(linked(), 'screen', 'end', 3_000)
    expect(trimmed.clips.every((entry) => entry.timelineDurationMs === 2_000 && entry.sourceDurationMs === 2_000 && entry.sourceInMs === 200)).toBe(true)
  })

  it('splits each linked clip and creates two independently addressable groups', () => {
    const ids = ['screen-right', 'camera-right', 'audio-right']; let cursor = 0
    const split = splitClip(linked(), 'screen', 3_000, () => ids[cursor++]!)
    expect(split.clips).toHaveLength(6)
    expect(split.groups.map((group) => group.clipIds)).toEqual([['screen', 'camera', 'audio'], ids])
    expect(split.clips.find((entry) => entry.id === 'camera-right')).toMatchObject({ timelineStartMs: 3_000, sourceInMs: 2_200, timelineDurationMs: 2_000 })
  })

  it('allows a detached sidecar to move and change speed alone', () => {
    const detached = detachClip(linked(), 'camera')
    const edited = setPlaybackRate(moveClip(detached, 'camera', 5_000), 'camera', 2)
    expect(edited.clips.find((entry) => entry.id === 'camera')).toMatchObject({ timelineStartMs: 5_000, playbackRate: 2, timelineDurationMs: 2_000 })
    expect(edited.clips.find((entry) => entry.id === 'screen')).toMatchObject({ timelineStartMs: 1_000, playbackRate: 1 })
  })

  it('reattaches only clips with timing compatible with their group', () => {
    const detached = detachClip(linked(), 'camera')
    expect(attachClip(detached, 'camera', 'recording').groups[0].clipIds).toContain('camera')
    const incompatible = moveClip(detached, 'camera', 2_000)
    expect(() => attachClip(incompatible, 'camera', 'recording')).toThrow(/incompatible/)
  })

  it('supports enable, delete and visual transforms without deleting media', () => {
    const disabled = setClipEnabled(linked(), 'camera', false)
    expect(disabled.clips.find((entry) => entry.id === 'camera')?.enabled).toBe(false)
    const transformed = transformClip(disabled, 'camera', { x: -.2, y: .2, width: 2, height: .4 })
    expect(transformed.clips.find((entry) => entry.id === 'camera')?.transform).toEqual({ x: 0, y: .2, width: 1, height: .4 })
    expect(deleteClip(transformed, 'camera').clips.map((entry) => entry.mediaId)).toContain('media-screen')
    expect(() => transformClip(linked(), 'audio', { x: 0, y: 0, width: 1, height: 1 })).toThrow(/Audio/)
  })

  it('migrates video, audio, image and annotation layers into v2 clips', () => {
    const migrated = migrateLegacyComposition({ media: [{ id: 'v', kind: 'video', durationMs: 2_000 }, { id: 'a', kind: 'audio', durationMs: 2_000 }, { id: 'i', kind: 'image', durationMs: 0 }], layers: [{ id: 'video', kind: 'video', assetId: 'v', startMs: 0, endMs: 1_000, enabled: true, order: 0 }, { id: 'audio', kind: 'audio', assetId: 'a', startMs: 100, endMs: 900, enabled: true, order: 1 }, { id: 'image', kind: 'image', assetId: 'i', startMs: 0, endMs: 500, enabled: true, order: 2 }, { id: 'caption', kind: 'caption', startMs: 300, endMs: 700, enabled: true, order: 3 }] })
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.clips.map((entry) => entry.kind)).toEqual(['video', 'audio', 'image', 'annotation'])
    expect(migrated.clips.every((entry) => entry.playbackRate === 1 && entry.sourceInMs === 0)).toBe(true)
  })
})
