import { describe, expect, it, vi } from 'vitest'
import { drawCompositionLayers, renderCompositionFrame } from './render'
import type { CompositionSnapshot } from '../export-types'
import { DEFAULT_OUTPUT_CANVAS } from '../../video-editor/canvas/output-canvas'
import type { ClipComposition, ClipAppearance } from '../../video-editor/composition/composition-types'

const screenAppearance: ClipAppearance = {
  cornerRadius: 'none', shadowSize: 'none', shadowColor: '#000000', shadowDirection: 'all',
  borderEnabled: false, borderColor: '#000000', borderWidth: 1,
  frame: 'none', frameTitle: '', frameColor: '#c0c0c0', frameShowMenu: true, frameShowScrollbars: true,
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
      left: { springEnabled: true, springIntensity: 100, rippleEnabled: false, rippleSize: 30, rippleColor: '#f00' },
      right: { springEnabled: true, springIntensity: 100, rippleEnabled: false, rippleSize: 30, rippleColor: '#00f' },
    },
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
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 10, 50, 20, 0, 0, 100, 50)
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

  it('draws only the caption sentence active at the current time', () => {
    const value = snapshot()
    value.composition.clips.push({ id: 'caption', kind: 'caption', name: 'Caption', timelineStartMs: 0, timelineDurationMs: 1_000, sourceInMs: 0, sourceDurationMs: 1_000, playbackRate: 1, enabled: true, order: 1, caption: { sentences: [{ id: 's', text: 'Visible', startMs: 100, endMs: 300, words: [] }], style: { color: '#fff', fontSize: 20, shadowColor: '#000', shadowBlur: 0, placement: 'bottom' } } })
    const ctx = context()
    drawCompositionLayers(ctx, value, .2)
    expect(ctx.fillText).toHaveBeenCalledWith('Visible', expect.any(Number), expect.any(Number), expect.any(Number))
  })
})
