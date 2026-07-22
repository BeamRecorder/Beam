import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { createCompositionSnapshot } from './snapshot'
import { DEFAULT_OUTPUT_CANVAS } from '../../video-editor/canvas/output-canvas'

const base = () => ({ videoSrc: 'file:///screen.mp4', duration: 4, width: 1920, height: 1080, fps: 30, canvas: DEFAULT_OUTPUT_CANVAS, videoEnabled: true, background: null, blurPercent: 0, editorData: null, zooms: [], composition: { media: [], layers: [] }, cursorSettings: { selectedCursor: 'automatic' as const, size: 24, color: '#000000', shadow: { enabled: true, blur: 6, color: '#000000' }, ripple: { enabled: true, color: '#ff5a1f', size: 30 } }, systemAudioEnabled: true, micAudioEnabled: true })

describe('createCompositionSnapshot', () => {
  it('rejects an unavailable source video', () => expect(() => createCompositionSnapshot({ ...base(), videoSrc: null })).toThrow('indisponible'))
  it('clamps invalid geometry and duration without inventing cursor data', () => {
    const snapshot = createCompositionSnapshot({ ...base(), duration: -1, width: 0, height: -8, fps: 0 })
    expect(snapshot.video).toMatchObject({ width: 1, height: 1, fps: 1 }); expect(snapshot.duration).toBe(0); expect(snapshot.cursor.available).toBe(false)
  })
  it('uses saved output dimensions independently from the capture dimensions', () => {
    const snapshot = createCompositionSnapshot({ ...base(), canvas: { preset: '4:5', width: 1, height: 1, showBackground: false } })
    expect(snapshot.video).toMatchObject({ width: 1920, height: 1080 }); expect(snapshot.canvas).toMatchObject({ width: 1080, height: 1350, showBackground: false })
  })
  it('keeps an immutable copy of the editing scene', () => {
    const zooms = [{ id: 'z', sessionId: 's', startMs: 0, endMs: 10, focus: { cx: .5, cy: .5 }, depth: 1 as const, mode: 'manual' as const }]
    const snapshot = createCompositionSnapshot({ ...base(), zooms }); zooms[0].focus.cx = .1
    expect(snapshot.zooms[0].focus.cx).toBe(.5)
  })
  it('copies reactive editor data without passing Vue proxies to structured clone', () => {
    const editorData = reactive({
      tracks: [],
      cursor: {
        available: true,
        events: [{ event: 'shape' as const, sessionNs: 1, shapeId: 'arrow', hotspot: { x: 2, y: 3 } }],
        telemetry: [{ timeMs: 1, cx: .2, cy: .3 }],
        shapes: { arrow: { src: 'file:///arrow.png', hotspot: { x: 2, y: 3 } } },
        missing: ['cursor.json'],
      },
    })
    const snapshot = createCompositionSnapshot({ ...base(), editorData: editorData as never, zooms: reactive([{ id: 'z', sessionId: 's', startMs: 0, endMs: 10, focus: { cx: .5, cy: .5 }, depth: 1 as const, mode: 'manual' as const }]) })
    editorData.cursor.events[0].hotspot.x = 9
    expect(snapshot.cursor.events[0]).toMatchObject({ hotspot: { x: 2, y: 3 } })
    expect(snapshot.zooms[0].focus).toEqual({ cx: .5, cy: .5 })
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
    const snapshot = createCompositionSnapshot({ ...base(), videoEnabled: false, background: { kind: 'image', path: '/bg.png' } as never })
    expect(snapshot.background).toEqual({ kind: 'image', src: '/bg.png' }); expect(snapshot.layers.map((layer) => layer.enabled)).toEqual([true, false, false])
  })
  it('copies composition and cursor settings as an immutable export scene', () => {
    const input = base(); input.composition.layers.push({ id: 'caption', kind: 'caption', name: 'Caption', startMs: 0, endMs: 10, enabled: true, order: 0, caption: { sentences: [], style: { color: '#fff', fontSize: 12, shadowColor: '#000', shadowBlur: 0, placement: 'bottom' } } } as never)
    const snapshot = createCompositionSnapshot(input); input.cursorSettings.size = 99
    expect(snapshot.composition.layers).toHaveLength(1); expect(snapshot.cursorSettings.size).toBe(24)
  })
})
