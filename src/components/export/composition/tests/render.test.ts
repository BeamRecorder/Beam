import { describe, expect, it, vi } from 'vitest'
import { drawCompositionLayers, renderCompositionFrame } from './render'
import type { CompositionSnapshot } from '../export-types'
import { DEFAULT_OUTPUT_CANVAS } from '../../video-editor/canvas/output-canvas'
import type { ClipComposition, ClipAppearance } from '../../video-editor/composition/composition-types'

const screenAppearance: ClipAppearance = {
  cornerRadius: 'none', shadowSize: 'none', shadowColor: '#000000', shadowDirection: 'all',
  borderEnabled: false, borderColor: '#000000', borderWidth: 1,
  frame: 'none', frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true, frameChromeScale: 1,
}
const composition = (): ClipComposition => ({
  schemaVersion: 1,
  assets: [{ id: 'screen-asset', kind: 'video', name: 'Screen', fileName: null, durationMs: 1_000, width: 100, height: 50, src: 'file:///screen.mp4', origin: 'session' }],
  clips: [{ id: 'screen', kind: 'screen', name: 'Screen', assetId: 'screen-asset', timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 0, transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: screenAppearance }],
})
const snapshot = (): CompositionSnapshot => ({
  duration: 1,
  render: { sourceWidth: 100, sourceHeight: 50, fps: 30 },
  canvas: { ...DEFAULT_OUTPUT_CANVAS, width: 100, height: 50 },
  background: null,
  blurPercent: 0,
  zooms: [],
  cursor: { available: false, telemetry: [], missing: [], shapes: {}, catalog: {}, events: [] },
  cursorSettings: {
    selectedCursor: 'automatic',
    size: 24,
    color: '#000',
    shadow: { enabled: false, blur: 0, color: '#000', direction: 'bottom' },
    clickEffects: {
      left: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#f00' },
      right: { springEnabled: true, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#00f' },
    },
    motion: { preset: 'smooth' as const, smoothing: .67, springMassMultiplier: 1.29, motionBlur: .4 },
  },
  composition: composition(),
})
const context = () => ({
  fillStyle: '', strokeStyle: '', filter: '', font: '', textAlign: '', textBaseline: '', lineJoin: '',
  shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, globalAlpha: 1, lineWidth: 0,
  fillRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), drawImage: vi.fn(),
  save: vi.fn(), translate: vi.fn(), scale: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
  roundRect: vi.fn(), clip: vi.fn(), arc: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
  moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
}) as unknown as CanvasRenderingContext2D

describe('canonical composition rendering', () => {
  it('paints the fallback canvas when the screen clip has no available frame', () => {
    const ctx = context()
    renderCompositionFrame(ctx, null, snapshot(), 0)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 50)
  })

  it('uses crop and transform stored on the screen clip', () => {
    const value = snapshot()
    const screen = value.composition.clips[0]
    if (screen.kind !== 'screen') throw new Error('screen fixture missing')
    screen.crop = { x: .1, y: .2, width: .5, height: .4 }
    const ctx = context()
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA, videoWidth: 100, videoHeight: 50 } as HTMLVideoElement, value, 0)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 15, 10, 40, 20, 0, 0, 100, 50)
  })

  it('draws an active imported visual from its canonical clip', () => {
    const value = snapshot()
    value.composition.assets.push({ id: 'image', kind: 'image', name: 'Logo', fileName: 'logo.png', durationMs: 1_000, width: 10, height: 10, src: 'file:///logo.png', origin: 'project' })
    value.composition.clips.push({ id: 'logo', kind: 'image', name: 'Logo', assetId: 'image', timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 1, transform: { x: .1, y: .2, width: .3, height: .4 }, appearance: screenAppearance })
    const image = {} as CanvasImageSource
    const ctx = context()
    drawCompositionLayers(ctx, value, .2, new Map([['image', image]]))
    expect(ctx.drawImage).toHaveBeenCalledWith(image, 10, 10, 30, 20)
  })

  it('exports webcam placement, crop, mirror and complete appearance settings', () => {
    const value = snapshot()
    value.canvas = { ...value.canvas, width: 1000, height: 500 }
    const camera = { id: 'camera', kind: 'video' as const, name: 'Webcam', fileName: null, durationMs: 1_000, width: 100, height: 50, src: 'file:///camera.mp4', origin: 'session' as const }
    value.composition.assets.push(camera)
    value.composition.clips.push({
      id: 'webcam', kind: 'webcam', name: 'Webcam', assetId: camera.id, timelineStartMs: 0, timelineDurationMs: 1_000,
      sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 1,
      transform: { x: .1, y: .2, width: .3, height: .4 }, crop: { x: .1, y: .2, width: .5, height: .6 }, isMirrored: true,
      appearance: {
        cornerRadius: 42, shadowSize: 'none', shadowColor: '#123456', shadowDirection: 'top-left', borderEnabled: true,
        borderColor: '#abcdef', borderWidth: 4, frame: 'none', frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true, frameChromeScale: 1,
      },
    })
    const source = { displayWidth: 100, displayHeight: 50 } as unknown as CanvasImageSource
    const ctx = context()
    renderCompositionFrame(ctx, { readyState: HTMLMediaElement.HAVE_CURRENT_DATA, videoWidth: 100, videoHeight: 50 } as HTMLVideoElement, value, 0, null, undefined, new Map([['camera', source]]))
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 10, 10, 50, 30, expect.closeTo(100, .001), expect.closeTo(100, .001), 300, 200)
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)
    expect(ctx.roundRect).toHaveBeenCalledWith(100, expect.closeTo(100, .001), 300, 200, 42)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('keeps webcam layers when the screen frame is temporarily unavailable', () => {
    const value = snapshot()
    value.canvas = { ...value.canvas, width: 1000, height: 500 }
    const camera = { id: 'camera', kind: 'video' as const, name: 'Webcam', fileName: null, durationMs: 1_000, width: 100, height: 50, src: 'file:///camera.mp4', origin: 'session' as const }
    value.composition.assets.push(camera)
    value.composition.clips.push({ id: 'webcam', kind: 'webcam', name: 'Webcam', assetId: camera.id, timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 1, transform: { x: .1, y: .2, width: .3, height: .4 } })
    const source = {} as CanvasImageSource
    const ctx = context()
    renderCompositionFrame(ctx, null, value, 0, null, undefined, new Map([['camera', source]]))
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 100, expect.closeTo(100, .001), 300, 200)
  })

  it('draws only the caption sentence active at the current time', () => {
    const value = snapshot()
    value.composition.clips.push({ id: 'caption', kind: 'caption', name: 'Caption', timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 1, caption: { sentences: [{ id: 's', text: 'Visible', startMs: 100, endMs: 300, words: [] }], style: { color: '#fff', fontSize: 20, shadowColor: '#000', shadowBlur: 0, placement: 'bottom' } } })
    const ctx = context()
    drawCompositionLayers(ctx, value, .2)
    expect(ctx.fillText).toHaveBeenCalledWith('Visible', expect.any(Number), expect.any(Number), expect.any(Number))
  })

  it('exports a right click with its own ripple and rebound settings', () => {
    const value = snapshot()
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
      events: [
        { event: 'move', sessionNs: 0, pixelX: 25, pixelY: 25, normalizedX: .25, normalizedY: .5, visible: true },
        { event: 'button', sessionNs: 100_000_000, button: 2, pressed: true, normalizedX: .25, normalizedY: .5 },
      ],
    }
    value.cursorSettings.clickEffects = {
      left: { springEnabled: false, springIntensity: 50, rippleEnabled: false, rippleSize: 30, rippleColor: '#f00' },
      right: { springEnabled: true, springIntensity: 100, rippleEnabled: true, rippleSize: 60, rippleColor: '#00f' },
    }
    const ctx = context()
    const image = { complete: true, naturalWidth: 24 } as HTMLImageElement
    renderCompositionFrame(
      ctx,
      { readyState: HTMLMediaElement.HAVE_CURRENT_DATA, videoWidth: 100, videoHeight: 50 } as HTMLVideoElement,
      value,
      .15,
      null,
      new Map([['default', image]]),
    )
    expect(ctx.strokeStyle).toBe('#00f')
    expect(ctx.arc).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.closeTo(8, 5), 0, Math.PI * 2)
    expect(ctx.scale).toHaveBeenCalledWith(expect.closeTo(.707, 3), expect.closeTo(.707, 3))
    expect(ctx.drawImage).toHaveBeenCalled()
  })

  it('uses the configured cursor size as output pixels', () => {
    const value = snapshot()
    value.cursor = {
      available: true,
      telemetry: [],
      missing: [],
      shapes: {},
      catalog: {},
      events: [{ event: 'move', sessionNs: 0, pixelX: 25, pixelY: 25, normalizedX: .25, normalizedY: .5, visible: true }],
    }
    value.cursorSettings.size = 50
    const ctx = context()
    const image = { complete: true, naturalWidth: 24 } as HTMLImageElement

    renderCompositionFrame(
      ctx,
      { readyState: HTMLMediaElement.HAVE_CURRENT_DATA, videoWidth: 100, videoHeight: 50 } as HTMLVideoElement,
      value,
      0,
      null,
      new Map([['default', image]]),
    )

    expect(ctx.drawImage).toHaveBeenLastCalledWith(image, expect.any(Number), expect.any(Number), 50, 50)
  })
})
