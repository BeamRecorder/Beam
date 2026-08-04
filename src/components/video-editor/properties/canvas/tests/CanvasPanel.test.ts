import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackgroundMedia, BackgroundMediaGroup, BackgroundValue } from '../../../composables/backgroundCatalog'
import CanvasPanel from '../CanvasPanel.vue'

const { capture, previewState } = vi.hoisted(() => ({
  capture: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    onPreferencesChanged: vi.fn(),
    pickBackgroundLibraryMedia: vi.fn(),
  },
  previewState: {
    previews: {} as Record<string, string>,
    failed: {} as Record<string, boolean>,
    request: vi.fn(),
  },
}))

vi.mock('../../../../../api/capture', () => ({ capture }))
vi.mock('../useBackgroundPreviews', () => ({
  useBackgroundPreviews: () => previewState,
}))

const ComposerStub = {
  props: ['kind', 'color', 'gradient'],
  emits: ['add-color', 'add-gradient', 'update-color', 'update-gradient', 'close'],
  template: `
    <div class="composer-stub">
      <button class="composer-add-color" @click="$emit('add-color', '#abcdef')">add color</button>
      <button class="composer-add-gradient" @click="$emit('add-gradient', gradient)">add gradient</button>
      <button class="composer-close" @click="$emit('close')">close</button>
    </div>
  `,
}

class TestIntersectionObserver {
  static instances: TestIntersectionObserver[] = []
  readonly callback: IntersectionObserverCallback
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    TestIntersectionObserver.instances.push(this)
  }

  trigger(entries: Array<Partial<IntersectionObserverEntry>>) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

const media = (id: string, kind: 'image' | 'video'): BackgroundMedia => ({
  id,
  name: `${kind} ${id}`,
  path: `/wallpapers/${kind}/${id}.${kind === 'image' ? 'png' : 'mp4'}`,
  extension: kind === 'image' ? 'png' : 'mp4',
  kind,
})

const imageItems = Array.from({ length: 16 }, (_, index) => media(`image-${index}`, 'image'))
const videoItems = [media('video-0', 'video'), media('video-1', 'video')]
const groups: BackgroundMediaGroup[] = [
  { kind: 'image', label: 'Images', items: imageItems },
  { kind: 'video', label: 'Videos', items: videoItems },
]

let wrapper: VueWrapper | undefined
const originalObserver = globalThis.IntersectionObserver

const mountPanel = async (selectedBackground: BackgroundValue | null = null, backgroundGroups = groups) => {
  wrapper = mount(CanvasPanel, {
    props: {
      selectedBackground,
      backgroundGroups,
      projectId: 'project-1',
      blurPercent: 20,
    },
    global: { stubs: { BackgroundPresetComposer: ComposerStub } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  TestIntersectionObserver.instances = []
  globalThis.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  Object.keys(previewState.previews).forEach((key) => delete previewState.previews[key])
  Object.keys(previewState.failed).forEach((key) => delete previewState.failed[key])
  previewState.previews['image-0'] = 'blob:image-0'
  previewState.failed['image-1'] = true
  capture.getPreferences.mockResolvedValue({
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  })
  capture.updatePreferences.mockResolvedValue({
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  })
  capture.onPreferencesChanged.mockReturnValue(vi.fn())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  if (originalObserver) globalThis.IntersectionObserver = originalObserver
  else delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
  vi.restoreAllMocks()
})

describe('CanvasPanel', () => {
  it('renders media, requests visible previews, selects and previews hovered items, and loads more', async () => {
    const mounted = await mountPanel(imageItems[0])
    const observer = TestIntersectionObserver.instances[0]!
    const tiles = mounted!.findAll('.media-tile')
    expect(tiles).toHaveLength(15)
    expect(tiles[0]!.classes()).toContain('active')
    expect(tiles[0]!.find('img').attributes('src')).toBe('blob:image-0')
    expect(tiles[1]!.find('img').attributes('src')).toContain('image-1.png')
    expect(observer.observe).toHaveBeenCalled()

    observer.trigger([{ isIntersecting: false, target: tiles[2]!.element }])
    expect(previewState.request).not.toHaveBeenCalledWith(imageItems[2])
    observer.trigger([{ isIntersecting: true, target: tiles[2]!.element }])
    expect(previewState.request).toHaveBeenCalledWith(imageItems[2])

    await tiles[3]!.trigger('click')
    expect(mounted.emitted('update:selectedBackground')?.at(-1)).toEqual([imageItems[3]])
    await tiles[4]!.trigger('mouseenter')
    expect(mounted.findAll('.media-tile')[4]!.find('img').exists()).toBe(false)
    await tiles[4]!.trigger('mouseleave')
    await mounted!.get('.load-more button').trigger('click')
    expect(mounted!.findAll('.media-tile')).toHaveLength(16)
  })

  it('switches image/video tabs, handles video hover and imports by active kind', async () => {
    capture.pickBackgroundLibraryMedia.mockResolvedValueOnce(videoItems[0])
    const mounted = await mountPanel()
    const tabButtons = mounted!.findAll('.kind-group button')
    await tabButtons[1]!.trigger('click')
    expect(mounted!.findAll('.media-tile')).toHaveLength(2)
    expect(mounted!.findAll('.video-placeholder')).toHaveLength(2)
    await mounted!.findAll('.media-tile')[0]!.trigger('mouseenter')
    expect(mounted!.findAll('video')).toHaveLength(1)
    await mounted!.get('.import-btn').trigger('click')
    await flushPromises()
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenCalledWith('video')
    expect(mounted!.emitted('import:background')).toEqual([[videoItems[0]]])

    await tabButtons[1]!.trigger('click')
    expect(mounted!.findAll('.media-tile')).toHaveLength(2)
  })

  it('shows empty media states and imports a generic background from color or gradient tabs', async () => {
    capture.pickBackgroundLibraryMedia.mockResolvedValueOnce(undefined)
    const mounted = await mountPanel(null, [{ kind: 'video', label: 'Videos', items: videoItems }])
    expect(mounted!.find('.empty-backgrounds').exists()).toBe(true)
    await mounted!.get('.empty-backgrounds button').trigger('click')
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenCalledWith('image')

    const tabs = mounted!.findAll('.kind-group button')
    await tabs[2]!.trigger('click')
    expect(mounted!.find('.swatches-section').exists()).toBe(true)
    expect(mounted!.findAll('.swatch-tile').length).toBeGreaterThan(1)
    await mounted!.find('.swatch-tile:not(.custom-add-tile)').trigger('click')
    expect(mounted!.emitted('update:selectedBackground')).toBeTruthy()

    await tabs[3]!.trigger('click')
    expect(mounted!.find('.gradients-section').exists()).toBe(true)
    expect(mounted!.findAll('.swatch-tile').length).toBeGreaterThan(1)
    await mounted!.find('.swatch-tile:not(.custom-add-tile)').trigger('click')
    expect(mounted!.emitted('update:selectedBackground')).toHaveLength(2)
    await mounted!.get('.import-btn').trigger('click')
    await flushPromises()
    expect(capture.pickBackgroundLibraryMedia).toHaveBeenLastCalledWith('media')
  })

  it('edits selected presets and forwards blur slider interactions', async () => {
    const selectedColor = { id: 'color:#111827', name: '#111827', kind: 'color' as const, color: '#111827' }
    const mounted = await mountPanel(selectedColor)
    const tabs = mounted!.findAll('.kind-group button')
    await tabs[2]!.trigger('click')
    expect(mounted!.find('.edit-selected-preset').exists()).toBe(true)
    await mounted!.get('.edit-selected-preset').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.composer-stub')).not.toBeNull()

    ;(document.body.querySelector('.composer-add-color') as HTMLButtonElement).click()
    await flushPromises()
    expect(capture.updatePreferences).toHaveBeenCalled()
    expect(mounted!.emitted('update:selectedBackground')).toBeTruthy()

    const slider = mounted!.get('.big-slider-input')
    await slider.setValue('55')
    await slider.trigger('pointerdown')
    await slider.trigger('change')
    expect(mounted!.emitted('update:blurPercent')?.at(-1)).toEqual([55])
  })
})
