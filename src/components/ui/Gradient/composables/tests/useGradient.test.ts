import { defineComponent, h, nextTick, reactive } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGradient, type GradientPreset, type GradientValue } from '../useGradient'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))

vi.mock('~/ui/toast/toastStore', () => ({
  useToastStore: () => ({ addToast }),
}))

const baseValue = (): GradientValue => ({
  type: 'linear',
  angle: 45,
  stops: [
    { id: 'start', position: 0, color: '#000000', alpha: 1 },
    { id: 'end', position: 1, color: '#ffffff', alpha: 0.5 },
  ],
})

describe('useGradient', () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
    addToast.mockReset()
  })

  const mountComposable = (overrides: Record<string, unknown> = {}) => {
    const props = reactive({
      modelValue: baseValue(),
      ...overrides,
    }) as {
      modelValue: GradientValue | null | undefined
      presets?: GradientPreset[]
      minStops?: number
      maxStops?: number
    }
    const emit = vi.fn()
    let state!: ReturnType<typeof useGradient>
    const Harness = defineComponent({
      setup() {
        state = useGradient(props, emit)
        return () => h('div')
      },
    })
    wrapper = mount(Harness)
    return {
      props,
      emit,
      get state() {
        return state
      },
    }
  }

  it('normalizes malformed values, clamps fields, and builds the preview style', () => {
    const mounted = mountComposable({
      modelValue: {
        type: 'radial',
        angle: 'invalid',
        stops: [
          { id: '', position: -2, color: 'red', alpha: 4 },
          { id: 'valid', position: 2, color: '#12abEF', alpha: -1 },
          { id: 'fallback', position: Number.NaN, color: '#abcdef', alpha: 'bad' },
        ],
      } as unknown as GradientValue,
      minStops: 1,
    })

    expect(mounted.state.effectiveMinStops.value).toBe(2)
    expect(mounted.state.gradientType.value).toBe('radial')
    expect(mounted.state.gradientAngle.value).toBe(90)
    expect(mounted.state.stops.value).toEqual([
      expect.objectContaining({ position: 0, color: '#ffffff', alpha: 1 }),
      expect.objectContaining({ id: 'valid', position: 1, alpha: 0 }),
      expect.objectContaining({ id: 'fallback', position: 1, alpha: 1 }),
    ])
    expect(mounted.state.gradientPreviewStyle.value.background).toContain('radial-gradient(circle')
    expect(mounted.state.hexToRgb('not-a-color')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('falls back to two default stops and merges custom presets without duplicates', () => {
    const customPresets: GradientPreset[] = [
      { id: ' Fire ', stops: [{ id: 'custom', position: 0, color: '#123456' }] },
      { id: 'Custom', stops: [] },
      { id: '  ', stops: [] },
      { id: 'Invalid', stops: [] },
    ]
    const mounted = mountComposable({ modelValue: undefined, presets: customPresets })

    expect(mounted.state.stops.value).toEqual([
      { id: 'default-0', position: 0, color: '#000000', alpha: 1 },
      { id: 'default-1', position: 1, color: '#ffffff', alpha: 1 },
    ])
    expect(mounted.state.allPresets.value.slice(0, 3).map((preset) => preset.id)).toEqual(['Fire', 'Custom', 'Invalid'])
    expect(mounted.state.allPresets.value.filter((preset) => preset.id === 'Fire')).toHaveLength(1)

    mounted.props.modelValue = { stops: [] }
    return nextTick().then(() => {
      expect(mounted.state.stops.value).toHaveLength(2)
    })
  })

  it('updates gradient settings and selected stop values with clamping', async () => {
    const mounted = mountComposable()

    mounted.state.updateGradientType('radial')
    mounted.state.updateGradientType('anything-else')
    mounted.state.updateGradientAngle(-20)
    mounted.state.updateGradientAngle(500)
    expect(mounted.emit).toHaveBeenNthCalledWith(1, 'update:modelValue', expect.objectContaining({ type: 'radial' }))
    expect(mounted.emit).toHaveBeenLastCalledWith('update:modelValue', expect.objectContaining({ angle: 360 }))

    await mounted.state.handleStopClick({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'start')
    await nextTick()
    expect(mounted.state.isStopPopoverVisible.value).toBe(true)
    mounted.state.updateSelectedStopAlpha(5)
    mounted.state.updateSelectedStopPosition(-1)
    expect(mounted.state.selectedStop.value).toEqual(expect.objectContaining({ alpha: 1, position: 0 }))
    mounted.state.isStopPopoverVisible.value = false
    expect(mounted.state.selectedStopId.value).toBeNull()
  })

  it('adds interpolated stops, respects the maximum, and removes above the minimum', async () => {
    const mounted = mountComposable({ maxStops: 3 })

    mounted.state.addStop()
    await nextTick()
    expect(mounted.state.stops.value).toHaveLength(3)
    expect(mounted.state.stops.value[1]).toEqual(
      expect.objectContaining({ position: 0.5, color: '#808080', alpha: 0.75 }),
    )
    expect(mounted.state.selectedStopId.value).toMatch(/^stop-/)

    mounted.state.addStop()
    expect(addToast).toHaveBeenCalledWith('Maximum of 3 colors allowed.', 'warning')

    const selectedId = mounted.state.selectedStopId.value!
    mounted.state.removeStop(selectedId)
    expect(mounted.state.stops.value).toHaveLength(2)
    expect(mounted.state.isPopoverOpen.value).toBe(false)
    mounted.state.removeStop('start')
    expect(mounted.state.stops.value).toHaveLength(2)

    mounted.state.applyPreset({
      id: 'many',
      stops: [
        { id: 'a', position: 0, color: '#000000' },
        { id: 'b', position: 0.25, color: '#111111' },
        { id: 'c', position: 0.5, color: '#222222' },
        { id: 'd', position: 1, color: '#333333' },
      ],
    })
    await nextTick()
    expect(mounted.state.stops.value).toHaveLength(3)
    expect(mounted.state.selectedStopId.value).toBe('a')
  })

  it('handles track clicks, popover anchors, presets, and drag-to-trash behavior', async () => {
    vi.useFakeTimers()
    const mounted = mountComposable()
    const track = document.createElement('div')
    const rect = { left: 10, top: 100, width: 200, bottom: 140, height: 40 }
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(rect as DOMRect)
    mounted.state.trackRef.value = track

    mounted.state.onTrackClick({
      clientX: 110,
      target: track,
    } as unknown as MouseEvent)
    await nextTick()
    expect(mounted.state.stops.value).toHaveLength(3)
    expect(mounted.state.popoverAnchor.value).toEqual({ x: 110, y: 100 })

    const handle = document.createElement('button')
    handle.className = 'stop-handle'
    mounted.state.onTrackClick({ clientX: 20, target: handle } as unknown as MouseEvent)
    expect(mounted.state.stops.value).toHaveLength(3)

    const anchor = document.createElement('button')
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 7, top: 8 } as DOMRect)
    mounted.state.togglePresets({
      stopPropagation: vi.fn(),
      currentTarget: anchor,
    } as unknown as Event)
    expect(mounted.state.isPresetsPopoverOpen.value).toBe(true)
    expect(mounted.state.presetsPopoverAnchor.value).toEqual({ x: 7, y: 8 })
    mounted.state.togglePresets({
      stopPropagation: vi.fn(),
      currentTarget: anchor,
    } as unknown as Event)
    expect(mounted.state.isPresetsPopoverOpen.value).toBe(false)

    mounted.state.startDragging(
      { stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as PointerEvent,
      'start',
    )
    vi.advanceTimersByTime(40)
    expect(mounted.state.showDragLabels.value).toBe(true)
    const move = new Event('pointermove')
    Object.defineProperties(move, {
      clientX: { value: 180 },
      clientY: { value: 50 },
    })
    window.dispatchEvent(move)
    expect(mounted.state.dragDeleteDirection.value).toBe('top')
    expect(mounted.state.isOverTrash.value).toBe(true)
    window.dispatchEvent(new Event('pointerup'))
    expect(mounted.state.stops.value).toHaveLength(2)
    expect(mounted.state.draggingStopId.value).toBeNull()
    expect(mounted.state.showDragLabels.value).toBe(false)

    mounted.state.onTrackClick({ clientX: 0, target: track } as unknown as MouseEvent)
    expect(mounted.state.stops.value).toHaveLength(3)
    mounted.state.startDragging(
      { stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as PointerEvent,
      mounted.state.stops.value[0]!.id,
    )
    const below = new Event('pointermove')
    Object.defineProperties(below, {
      clientX: { value: 20 },
      clientY: { value: 200 },
    })
    window.dispatchEvent(below)
    expect(mounted.state.dragDeleteDirection.value).toBe('bottom')
    window.dispatchEvent(new Event('pointercancel'))
    expect(mounted.state.stops.value).toHaveLength(2)
  })
})
