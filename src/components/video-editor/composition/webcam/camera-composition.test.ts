import { describe, expect, it } from 'vitest'
import { addCameraSegments } from './camera-composition'

const editorData = (placement?: { x: number; y: number; width: number; height: number }) => ({
  sessionId: 'session-1',
  tracks: [{
    trackId: 'camera-1',
    kind: 'camera' as const,
    status: 'completed',
    format: { width: 1920, height: 1080, ...(placement ? { placement } : {}) },
    assets: [{ path: 'camera/segment-0001.webm', startNs: 1_250_000_000, endNs: 3_750_000_000, complete: true, exists: true, src: 'file:///camera.webm' }],
  }],
})

describe('addCameraSegments', () => {
  it('uses the recorded placement and session timestamps for a webcam layer', () => {
    const composition = addCameraSegments({ media: [], layers: [] }, editorData({ x: .7, y: .65, width: .2, height: .2 }) as never)
    const layer = composition.layers[0]
    expect(layer).toMatchObject({ startMs: 1250, endMs: 3750, transform: { x: .7, y: .65, width: .2, height: .2 }, reactToZoom: true })
  })

  it('keeps the established webcam placement for sessions without geometry metadata', () => {
    const composition = addCameraSegments({ media: [], layers: [] }, editorData() as never)
    expect(composition.layers[0]).toMatchObject({ transform: { x: .72, y: .72, width: .24, height: .24 } })
  })

  it('does not duplicate an already synchronized camera segment', () => {
    const first = addCameraSegments({ media: [], layers: [] }, editorData() as never)
    const second = addCameraSegments(first, editorData() as never)
    expect(second.media).toHaveLength(1)
    expect(second.layers).toHaveLength(1)
  })
})
