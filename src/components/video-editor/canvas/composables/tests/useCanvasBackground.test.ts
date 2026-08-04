import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasBackground } from '../useCanvasBackground'
import type { BackgroundValue } from '../../../composables/backgroundCatalog'

class FakeImage extends EventTarget {
  static instances: FakeImage[] = []
  naturalWidth = 320
  naturalHeight = 180
  src = ''

  constructor() {
    super()
    FakeImage.instances.push(this)
  }
}

const color = (value = '#123456'): BackgroundValue => ({
  id: `color:${value}`,
  name: value,
  kind: 'color',
  color: value,
})

const image = (path = '/wallpapers/image/desk.png'): BackgroundValue => ({
  id: path,
  name: 'Desk',
  path,
  extension: 'png',
  kind: 'image',
})

const video = (path = '/wallpapers/video/loop.mp4'): BackgroundValue => ({
  id: path,
  name: 'Loop',
  path,
  extension: 'mp4',
  kind: 'video',
})

const gradient = (type: 'linear' | 'radial' = 'linear'): BackgroundValue => ({
  id: `gradient:${type}`,
  name: 'Gradient',
  kind: 'gradient',
  gradient: {
    type,
    angle: 45,
    stops: [
      { id: 'a', position: 0, color: '#000000', alpha: 1 },
      { id: 'b', position: 1, color: '#ffffff', alpha: 0.5 },
    ],
  },
})

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '',
  }) as unknown as CanvasRenderingContext2D

let wrapper: VueWrapper | undefined
let selected!: Ref<BackgroundValue | null>
let blur!: Ref<number | undefined>
let renderCanvas!: ReturnType<typeof vi.fn>
let state!: ReturnType<typeof useCanvasBackground>
let backgroundVideo!: HTMLVideoElement
let createElementSpy!: ReturnType<typeof vi.spyOn>

const mountComposable = () => {
  selected = ref<BackgroundValue | null>(null)
  blur = ref<number | undefined>(0)
  renderCanvas = vi.fn()
  const Harness = defineComponent({
    setup() {
      state = useCanvasBackground(
        () => selected.value,
        () => blur.value,
        renderCanvas as unknown as () => void,
      )
      return () => h('div')
    },
  })
  wrapper = mount(Harness)
  backgroundVideo = createElementSpy.mock.results
    .map((result: { value: unknown }) => result.value)
    .find((element: unknown): element is HTMLVideoElement => element instanceof HTMLVideoElement) as HTMLVideoElement
}

beforeEach(() => {
  FakeImage.instances = []
  vi.stubGlobal('Image', FakeImage)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  createElementSpy = vi.spyOn(document, 'createElement')
  mountComposable()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useCanvasBackground', () => {
  it('draws colors, gradients, fallback media, and applies clamped blur', async () => {
    const ctx = context()
    selected.value = color()
    blur.value = 200
    await nextTick()
    state.drawBackground(ctx, { x: 10, y: 20, width: 100, height: 50 })
    expect(ctx.fillRect).toHaveBeenCalledWith(-86, -76, 292, 242)
    expect(ctx.filter).toBe('blur(48px)')

    selected.value = gradient('linear')
    await nextTick()
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.createLinearGradient).toHaveBeenCalled()

    selected.value = gradient('radial')
    await nextTick()
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.createRadialGradient).toHaveBeenCalled()

    selected.value = image()
    await nextTick()
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.fillRect).toHaveBeenCalled()
  })

  it('loads images, ignores stale or unloaded images, and reuses the cache', async () => {
    const ctx = context()
    selected.value = image('first.png')
    await nextTick()
    const firstImage = FakeImage.instances[0]
    expect(firstImage.src).toBe('first.png')

    renderCanvas.mockClear()
    selected.value = image('second.png')
    await nextTick()
    firstImage.dispatchEvent(new Event('load'))
    expect(renderCanvas).not.toHaveBeenCalled()

    const secondImage = FakeImage.instances[1]
    secondImage.naturalWidth = 0
    secondImage.dispatchEvent(new Event('load'))
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.drawImage).not.toHaveBeenCalled()

    secondImage.naturalWidth = 320
    secondImage.dispatchEvent(new Event('load'))
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.drawImage).toHaveBeenCalledWith(
      secondImage,
      0,
      0,
      320,
      180,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )

    selected.value = null
    await nextTick()
    selected.value = image('second.png')
    await nextTick()
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.drawImage).toHaveBeenCalled()
  })

  it('transitions between backgrounds and controls video playback', async () => {
    const ctx = context()
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    selected.value = color('#111111')
    await nextTick()
    selected.value = color('#222222')
    await nextTick()
    expect(state.isTransitioningBackground.value).toBe(true)
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    now.mockReturnValue(180)
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(state.isTransitioningBackground.value).toBe(false)

    selected.value = video()
    await nextTick()
    Object.defineProperties(backgroundVideo, {
      readyState: { configurable: true, value: 3 },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 360 },
    })
    backgroundVideo.dispatchEvent(new Event('loadeddata'))
    now.mockReturnValue(360)
    state.drawBackground(ctx, { x: 0, y: 0, width: 100, height: 100 })
    expect(ctx.drawImage).toHaveBeenCalledWith(
      backgroundVideo,
      0,
      0,
      640,
      360,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )

    state.syncVideoPlayback(true)
    expect(backgroundVideo.play).toHaveBeenCalled()
    selected.value = color()
    await nextTick()
    state.syncVideoPlayback(true)
    expect(backgroundVideo.pause).toHaveBeenCalled()
  })

  it('logs rejected video playback and cleans up on unmount', async () => {
    const error = new Error('autoplay blocked')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(error)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    selected.value = video()
    await nextTick()
    state.syncVideoPlayback(true)
    await Promise.resolve()
    expect(errorSpy).toHaveBeenCalledWith('Failed to play background video:', error)

    wrapper?.unmount()
    expect(backgroundVideo.pause).toHaveBeenCalled()
  })
})
