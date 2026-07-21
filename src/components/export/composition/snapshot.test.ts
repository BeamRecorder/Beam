import { describe, expect, it } from 'vitest'
import { createCompositionSnapshot } from './snapshot'

const base = () => ({ videoSrc: 'file:///screen.mp4', duration: 4, width: 1920, height: 1080, fps: 30, videoEnabled: true, background: null, editorData: null, zooms: [], systemAudioEnabled: true, micAudioEnabled: true })

describe('createCompositionSnapshot', () => {
  it('rejects an unavailable source video', () => expect(() => createCompositionSnapshot({ ...base(), videoSrc: null })).toThrow('indisponible'))
  it('clamps invalid geometry and duration without inventing cursor data', () => {
    const snapshot = createCompositionSnapshot({ ...base(), duration: -1, width: 0, height: -8, fps: 0 })
    expect(snapshot.video).toMatchObject({ width: 1, height: 1, fps: 1 }); expect(snapshot.duration).toBe(0); expect(snapshot.cursor.available).toBe(false)
  })
  it('keeps an immutable copy of the editing scene', () => {
    const zooms = [{ id: 'z', sessionId: 's', startMs: 0, endMs: 10, focus: { cx: .5, cy: .5 }, depth: 1 as const, mode: 'manual' as const }]
    const snapshot = createCompositionSnapshot({ ...base(), zooms }); zooms[0].focus.cx = .1
    expect(snapshot.zooms[0].focus.cx).toBe(.5)
  })
  it('adds only complete and enabled audio assets', () => {
    const tracks = [
      { trackId: 'sys', kind: 'system-audio', status: 'ok', assets: [{ path: 'a.wav', startNs: -2, exists: true, src: 'file:///a.wav', complete: true }, { path: 'bad', startNs: 0, exists: false, src: null, complete: true }] },
      { trackId: 'mic', kind: 'microphone', status: 'failed', assets: [{ path: 'm.wav', startNs: 1, exists: true, src: 'file:///m.wav', complete: true }] },
    ]
    const snapshot = createCompositionSnapshot({ ...base(), editorData: { tracks, cursor: { available: true, events: [], telemetry: [], shapes: {}, missing: [] } } as never })
    expect(snapshot.audio).toEqual([{ id: 'sys:a.wav', src: 'file:///a.wav', startSeconds: 0, enabled: true }])
  })
  it('marks disabled layers explicitly', () => {
    const snapshot = createCompositionSnapshot({ ...base(), videoEnabled: false, background: { kind: 'gif', path: '/bg.gif' } as never })
    expect(snapshot.background).toEqual({ kind: 'gif', src: '/bg.gif' }); expect(snapshot.layers.map((layer) => layer.enabled)).toEqual([true, false, false])
  })
})
