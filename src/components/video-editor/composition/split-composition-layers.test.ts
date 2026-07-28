import { describe, expect, it } from 'vitest'
import { splitCompositionLayersAt } from './split-composition-layers'
import type { ProjectComposition } from './composition-types'

const linkedComposition = (): ProjectComposition => ({
  media: [],
  layers: [
    { id: 'video', kind: 'video', name: 'Demo', assetId: 'asset', startMs: 1_000, endMs: 9_000, enabled: true, order: 0, groupId: 'linked', playbackRate: 1.5, sourceOffsetMs: 400 },
    { id: 'audio', kind: 'audio', name: 'Demo audio', assetId: 'asset', startMs: 1_000, endMs: 9_000, enabled: true, order: 1, groupId: 'linked', playbackRate: 1.5, sourceOffsetMs: 400 },
  ],
  visualTrackOrder: ['video', 'base-video'],
})

describe('splitCompositionLayersAt', () => {
  it('splits linked media together, preserving their source position and a new right-side link', () => {
    let id = 0
    const result = splitCompositionLayersAt(linkedComposition(), 3_000, 10_000, () => `new-${++id}`)

    expect(result.layers).toHaveLength(4)
    expect(result.layers.map((layer) => [layer.id, layer.startMs, layer.endMs])).toEqual([
      ['video', 1_000, 3_000], ['new-1', 3_000, 9_000], ['audio', 1_000, 3_000], ['new-3', 3_000, 9_000],
    ])
    expect(result.layers[1]).toMatchObject({ groupId: 'new-2', sourceOffsetMs: 3_400 })
    expect(result.layers[3]).toMatchObject({ groupId: 'new-2', sourceOffsetMs: 3_400 })
    expect(result.visualTrackOrder).toEqual(['video', 'new-1', 'base-video'])
    expect(result.baseVideoCuts).toEqual([3_000])
  })

  it('does not change clips when the playhead is at the timeline edge', () => {
    const composition = linkedComposition()
    expect(splitCompositionLayersAt(composition, 0, 10_000)).toBe(composition)
  })

  it('records a cut for the main video when no imported layer crosses the playhead', () => {
    expect(splitCompositionLayersAt({ media: [], layers: [] }, 2_000, 5_000).baseVideoCuts).toEqual([2_000])
  })
})
