import { describe, expect, it, vi } from 'vitest'
import { drawCompositionLayers, renderCompositionFrame } from './render'
import type { CompositionSnapshot } from '../export-types'
import { DEFAULT_OUTPUT_CANVAS } from '../../video-editor/canvas/output-canvas'

const snapshot = (enabled = true): CompositionSnapshot => ({ duration: 1, video: { src: 'x', width: 100, height: 50, fps: 30, enabled }, canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 100, height: 50 }, background: null, blurPercent: 0, zooms: [], cursor: { available: true, telemetry: [], missing: [], shapes: { arrow: { src: 'x', hotspot: { x: 2, y: 3 } } }, events: [{ event: 'move', sessionNs: 0, pixelX: 0, pixelY: 0, normalizedX: .5, normalizedY: .5, visible: true }, { event: 'shape', sessionNs: 0, shapeId: 'arrow', hotspot: { x: 2, y: 3 } }] }, cursorSettings: { selectedCursor: 'automatic', size: 24, color: '#000', shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' }, clickSpring: { enabled: true }, ripple: { enabled: false, color: '#f00', size: 30 } }, audio: [], composition: { media: [], layers: [] }, layers: [] })
const context = () => ({ fillStyle: '', fillRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), drawImage: vi.fn(), save: vi.fn(), translate: vi.fn(), scale: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), clip: vi.fn(), arc: vi.fn(), stroke: vi.fn(), font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0, globalAlpha: 1, lineWidth: 0, strokeStyle: '' }) as unknown as CanvasRenderingContext2D

describe('renderCompositionFrame', () => {
  it('always paints the base and optional background', () => {
    const ctx = context(); renderCompositionFrame(ctx, null, snapshot(), 0, {} as CanvasImageSource)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50); expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })
  it('does not draw video when its layer is disabled', () => {
    const ctx = context(); renderCompositionFrame(ctx, { readyState: 4 } as HTMLVideoElement, snapshot(false), 0)
    expect(ctx.save).not.toHaveBeenCalled()
  })
  it('draws the video and a visible cursor in camera space', () => {
    const ctx = context(); const image = { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA } as HTMLVideoElement, snapshot(), 0, null, new Map([['default', image]]))
    expect(ctx.save).toHaveBeenCalledTimes(4); expect(ctx.drawImage).toHaveBeenCalledTimes(2); expect(ctx.translate).toHaveBeenCalledWith(50, 25)
  })
  it('uses the semantic cursor selected by an automatic cursor event', () => {
    const value = snapshot()
    value.cursor.events[1] = { event: 'shape', sessionNs: 0, cursorId: 'text', cursorKind: 'textcursor', nativeCursorId: 'system:text', hotspot: { x: 0, y: 0 } }
    const defaultImage = { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement
    const textImage = { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement
    const ctx = context()
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA } as HTMLVideoElement, value, 0, null, new Map([['default', defaultImage], ['textcursor', textImage]]))
    expect(ctx.drawImage).toHaveBeenLastCalledWith(textImage, -12, -12, 24, 24)
  })
  it('applies the saved base-video crop before rendering the export frame', () => {
    const value = snapshot(); value.composition.baseVideoCrop = { x: .1, y: .2, width: .5, height: .4 }
    const ctx = context(); renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA, videoWidth: 100, videoHeight: 50 } as HTMLVideoElement, value, 0)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 15, 10, 40, 20, 0, 0, 100, 50)
  })
  it('draws active image layers using their normalized transform', () => {
    const value = snapshot(); value.composition = { media: [{ id: 'image', kind: 'image', name: 'Logo', fileName: 'logo.png', durationMs: 0, width: 10, height: 10, src: 'file:///logo.png' }], layers: [{ id: 'layer', kind: 'image', name: 'Logo', assetId: 'image', startMs: 0, endMs: 500, enabled: true, order: 0, transform: { x: .1, y: .2, width: .3, height: .4 } }] }
    const ctx = context(); drawCompositionLayers(ctx, value, .2, new Map([['image', {} as CanvasImageSource]]), false)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 10, 30, 20)
  })
  it('draws an active imported video when the visual stack addresses it directly', () => {
    const value = snapshot()
    value.composition = {
      media: [{ id: 'video-overlay', kind: 'video', name: 'Overlay', fileName: 'overlay.mp4', durationMs: 1000, width: 100, height: 50, src: 'file:///overlay.mp4' }],
      layers: [{ id: 'overlay-layer', kind: 'video', name: 'Overlay', assetId: 'video-overlay', startMs: 0, endMs: 1000, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 } }],
      visualTrackOrder: ['overlay-layer', 'base-video'],
    }
    const overlay = {} as CanvasImageSource
    const ctx = context()
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA } as HTMLVideoElement, value, .2, null, undefined, new Map([['video-overlay', overlay]]))
    expect(ctx.drawImage).toHaveBeenCalledWith(overlay, 0, 0, 100, 50)
  })
  it('draws only a caption sentence active at the current time', () => {
    const value = snapshot(); value.composition = { media: [], layers: [{ id: 'caption', kind: 'caption', name: 'Caption', startMs: 0, endMs: 1000, enabled: true, order: 0, caption: { sentences: [{ id: 's', text: 'Visible', startMs: 100, endMs: 300, words: [] }], style: { color: '#fff', fontSize: 20, shadowColor: '#000', shadowBlur: 2, placement: 'bottom' } } }] }
    const ctx = context(); drawCompositionLayers(ctx, value, .2, new Map(), false)
    expect(ctx.fillText).toHaveBeenLastCalledWith('Visible', 50, 43.5, 72)
  })
})
