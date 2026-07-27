import { describe, expect, it } from 'vitest'
import { captionSources } from './caption-sources'
import type { ProjectComposition } from '../../composition/composition-types'

const composition = (overrides: Partial<ProjectComposition> = {}): ProjectComposition => ({
  media: [],
  layers: [],
  ...overrides,
})

describe('captionSources', () => {
  it('lists an audio track linked to an imported video', () => {
    const sources = captionSources(composition({
      media: [{ id: 'video', kind: 'video', name: 'Demo', fileName: 'demo.mp4', durationMs: 1000, width: 1920, height: 1080, src: 'file:///demo.mp4' }],
      layers: [{ id: 'video-audio', kind: 'audio', name: 'Demo audio', assetId: 'video', startMs: 0, endMs: 1000, enabled: true, order: 0, volume: 100 }],
    }))

    expect(sources).toEqual([{ id: 'media:video-audio', label: 'Demo audio', src: 'file:///demo.mp4' }])
  })

  it('lists audio tracks regardless of their media kind', () => {
    const sources = captionSources(composition({
      media: [{ id: 'audio', kind: 'audio', name: 'Narration', fileName: 'voice.mp3', durationMs: 1000, width: null, height: null, src: 'file:///voice.mp3' }],
      layers: [{ id: 'narration', kind: 'audio', name: 'Voice-over', assetId: 'audio', startMs: 0, endMs: 1000, enabled: false, order: 0, volume: 100 }],
    }))

    expect(sources).toEqual([{ id: 'media:narration', label: 'Voice-over', src: 'file:///voice.mp3' }])
  })

  it('ignores audio tracks whose media is unavailable', () => {
    const sources = captionSources(composition({
      layers: [{ id: 'missing-audio', kind: 'audio', name: 'Missing', assetId: 'missing', startMs: 0, endMs: 1000, enabled: true, order: 0, volume: 100 }],
    }))

    expect(sources).toEqual([])
  })
})
