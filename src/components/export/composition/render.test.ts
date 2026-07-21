import { describe, expect, it, vi } from 'vitest'
import { renderCompositionFrame } from './render'
import type { CompositionSnapshot } from '../export-types'

const snapshot = (enabled = true): CompositionSnapshot => ({ duration: 1, video: { src: 'x', width: 100, height: 50, fps: 30, enabled }, background: null, zooms: [], cursor: { available: true, telemetry: [], missing: [], shapes: { arrow: { src: 'x', hotspot: { x: 2, y: 3 } } }, events: [{ event: 'move', sessionNs: 0, pixelX: 0, pixelY: 0, normalizedX: .5, normalizedY: .5, visible: true }, { event: 'shape', sessionNs: 0, shapeId: 'arrow', hotspot: { x: 2, y: 3 } }] }, audio: [], layers: [] })
const context = () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), translate: vi.fn(), scale: vi.fn(), restore: vi.fn() }) as unknown as CanvasRenderingContext2D

describe('renderCompositionFrame', () => {
  it('always paints the base and optional background', () => {
    const ctx = context(); renderCompositionFrame(ctx, { readyState: 0 } as HTMLVideoElement, snapshot(), 0, {} as CanvasImageSource)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50); expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })
  it('does not draw video when its layer is disabled', () => {
    const ctx = context(); renderCompositionFrame(ctx, { readyState: 4 } as HTMLVideoElement, snapshot(false), 0)
    expect(ctx.save).not.toHaveBeenCalled()
  })
  it('draws the video and a visible cursor in camera space', () => {
    const ctx = context(); const image = { complete: true, naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA } as HTMLVideoElement, snapshot(), 0, null, new Map([['arrow', image]]))
    expect(ctx.save).toHaveBeenCalledOnce(); expect(ctx.drawImage).toHaveBeenCalledTimes(2); expect(ctx.translate).toHaveBeenCalledWith(50, 25)
  })
})
