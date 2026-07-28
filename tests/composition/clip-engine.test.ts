import { describe, expect, it } from 'vitest'
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  CompositionEngineError,
  activeClipsAt,
  createComposition,
  deleteClip,
  detachClip,
  linkClips,
  moveClip,
  setClipEnabled,
  setPlaybackRate,
  setTransform,
  sourceTimeAt,
  splitClip,
  trimClip,
} from '../../src/components/video-editor/composition/engine/clip-engine'
import type {
  AudioClip,
  Clip,
  ClipComposition,
  MediaAsset,
  VisualClip,
} from '../../src/components/video-editor/composition/composition-types'

const asset = (id: string, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: `${id}.${kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : 'mp4'}`,
  durationMs: 4_200,
  width: kind === 'audio' ? null : 1920,
  height: kind === 'audio' ? null : 1080,
  src: `file:///${id}`,
  origin: 'project',
})

const visualClip = (
  id: string,
  kind: VisualClip['kind'] = 'video',
  overrides: Partial<VisualClip> = {},
): VisualClip => ({
  id,
  kind,
  name: id,
  assetId: `asset-${id}`,
  timelineStartMs: 1_000,
  timelineDurationMs: 4_000,
  sourceInMs: 200,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  ...overrides,
})

const audioClip = (id: string, overrides: Partial<AudioClip> = {}): AudioClip => ({
  id,
  kind: 'audio',
  name: id,
  assetId: `asset-${id}`,
  role: 'system',
  volume: 100,
  timelineStartMs: 1_000,
  timelineDurationMs: 4_000,
  sourceInMs: 200,
  sourceDurationMs: 4_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  ...overrides,
})

const compositionFor = (clips: Clip[]): ClipComposition => createComposition(
  clips.flatMap((clip) => clip.kind === 'caption' ? [] : [asset(clip.assetId, clip.kind === 'audio' ? 'audio' : clip.kind === 'image' ? 'image' : 'video')]),
  clips,
)

const linked = (): ClipComposition => {
  const groupId = 'recording'
  return compositionFor([
    visualClip('screen', 'screen', { groupId }),
    visualClip('camera', 'webcam', { groupId }),
    audioClip('audio', { groupId }),
  ])
}

describe('clip composition engine', () => {
  it('maps timeline times to source times and excludes times outside a clip', () => {
    const value = visualClip('a', 'video', {
      playbackRate: 2,
      timelineDurationMs: 2_000,
      sourceDurationMs: 4_000,
    })
    expect(sourceTimeAt(value, 1_000)).toBe(200)
    expect(sourceTimeAt(value, 1_500)).toBe(1_200)
    expect(sourceTimeAt(value, 3_001)).toBeNull()
  })

  it('returns only enabled active clips in render order', () => {
    const composition = compositionFor([
      visualClip('back', 'image', { order: 2 }),
      visualClip('front', 'video', { order: 1 }),
      audioClip('hidden', { enabled: false, order: 3 }),
    ])
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

  it('trims a linked group from its start while advancing every source', () => {
    const trimmed = trimClip(linked(), 'screen', 'start', 2_000)
    expect(trimmed.clips.map((entry) => [entry.timelineStartMs, entry.timelineDurationMs, entry.sourceInMs, entry.sourceDurationMs])).toEqual([
      [2_000, 3_000, 1_200, 3_000],
      [2_000, 3_000, 1_200, 3_000],
      [2_000, 3_000, 1_200, 3_000],
    ])
  })

  it('trims a linked group from its end without changing source in', () => {
    const trimmed = trimClip(linked(), 'screen', 'end', 3_000)
    expect(trimmed.clips.every((entry) => entry.timelineDurationMs === 2_000 && entry.sourceDurationMs === 2_000 && entry.sourceInMs === 200)).toBe(true)
  })

  it('splits every linked clip and gives the right side an independent group', () => {
    const ids = ['right-group', 'screen-right', 'camera-right', 'audio-right']
    let cursor = 0
    const split = splitClip(linked(), 'screen', 3_000, () => ids[cursor++]!)
    expect(split.clips).toHaveLength(6)
    expect(new Set(split.clips.slice(0, 3).map((entry) => entry.groupId))).toEqual(new Set(['recording']))
    expect(new Set(split.clips.slice(3).map((entry) => entry.groupId))).toEqual(new Set(['right-group']))
    expect(split.clips.find((entry) => entry.id === 'audio-right')).toMatchObject({ timelineStartMs: 3_000, sourceInMs: 2_200, timelineDurationMs: 2_000 })
  })

  it('lets a detached sidecar move and change speed alone', () => {
    const detached = detachClip(linked(), 'camera')
    const edited = setPlaybackRate(moveClip(detached, 'camera', 5_000), 'camera', 2)
    expect(edited.clips.find((entry) => entry.id === 'camera')).toMatchObject({ timelineStartMs: 5_000, playbackRate: 2, timelineDurationMs: 2_000 })
    expect(edited.clips.find((entry) => entry.id === 'screen')).toMatchObject({ timelineStartMs: 1_000, playbackRate: 1 })
  })

  it('links only timing-compatible clips', () => {
    const detached = detachClip(linked(), 'camera')
    const relinked = linkClips(detached, ['screen', 'camera'], 'new-recording')
    expect(relinked.clips.filter((entry) => entry.groupId === 'new-recording').map((entry) => entry.id)).toEqual(['screen', 'camera'])
    const incompatible = moveClip(detached, 'camera', 2_000)
    expect(() => linkClips(incompatible, ['screen', 'camera'])).toThrow(/share timeline timing/)
  })

  it('supports enable, delete and visual transforms while pruning unused media', () => {
    const disabled = setClipEnabled(linked(), 'camera', false)
    expect(disabled.clips.find((entry) => entry.id === 'camera')?.enabled).toBe(false)
    const transformed = setTransform(disabled, 'camera', { x: -.2, y: .2, width: 2, height: .4 })
    expect(transformed.clips.find((entry) => entry.id === 'camera')).toMatchObject({ transform: { x: -.2, y: .2, width: 2, height: .4 } })
    const deleted = deleteClip(transformed, 'camera')
    expect(deleted.clips.map((entry) => entry.id)).not.toContain('camera')
    expect(deleted.assets.map((entry) => entry.id)).not.toContain('asset-camera')
    expect(() => setTransform(linked(), 'audio', { x: 0, y: 0, width: 1, height: 1 })).toThrow(/Audio/)
  })
})
