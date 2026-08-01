import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportRequest } from './export-types'

const { supportedVideoCodec, mockJob } = vi.hoisted(() => ({
  supportedVideoCodec: vi.fn(),
  mockJob: {
    start: vi.fn(),
    cancel: vi.fn(),
    state: null as Record<string, Ref<unknown>> | null,
  },
}))

vi.mock('./mediabunny/exporter', () => ({ supportedVideoCodec }))
vi.mock('./useExportJob', async () => {
  const { ref, computed } = await import('vue')
  const progress = ref(null)
  const error = ref<string | null>(null)
  const result = ref<{ path: string; format: 'webm' | 'mp4' } | null>(null)
  const exporting = ref(false)
  mockJob.state = { progress, error, result, isExporting: computed(() => exporting.value), exporting }
  return {
    useExportJob: () => ({ progress, error, result, isExporting: computed(() => exporting.value), start: mockJob.start, cancel: mockJob.cancel }),
  }
})

import ExportPopover from './ExportPopover.vue'

const Popover = { template: '<div class="popover-stub"><slot name="trigger" /><slot /></div>' }
const Button = { inheritAttrs: false, emits: ['click'], template: '<button v-bind="$attrs" class="button-stub" @click="$emit(\'click\')"><slot /></button>' }
const ButtonGroup = { template: '<div class="button-group-stub"><slot /></div>' }
const ProgressBar = { props: ['value'], template: '<div class="progress-stub">{{ value }}</div>' }

const request = {
  projectName: 'Demo project',
  snapshot: {
    duration: 12,
    canvas: { width: 1920, height: 1080 },
    render: { fps: 60, sourceWidth: 1920, sourceHeight: 1080 },
  },
} as unknown as Omit<ExportRequest, 'format' | 'preset'>

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  supportedVideoCodec.mockResolvedValue('vp9')
  Object.defineProperty(window, 'capture', { configurable: true, value: { openFile: vi.fn() } })
  if (mockJob.state) {
    mockJob.state.progress.value = null
    mockJob.state.error.value = null
    mockJob.state.result.value = null
    mockJob.state.exporting.value = false
  }
})

describe('ExportPopover', () => {
  const mountExport = () => mount(ExportPopover, {
    props: { request },
    global: { stubs: { Popover, Button, ButtonGroup, ProgressBar } },
  })

  it('selects format and quality, then reports an unsupported codec', async () => {
    supportedVideoCodec.mockResolvedValueOnce(null)
    const wrapper = mountExport()
    const buttons = wrapper.findAll('.button-stub')
    await buttons.find((button) => button.text() === 'MP4')?.trigger('click')
    await buttons.find((button) => button.text() === 'high')?.trigger('click')
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click')
    expect(supportedVideoCodec).toHaveBeenCalledWith(expect.objectContaining({ format: 'mp4', preset: 'high' }))
    expect(wrapper.get('[role="alert"]').text()).toContain('MP4')
    expect(mockJob.start).not.toHaveBeenCalled()
  })

  it('starts an export, displays its result, and opens the generated file', async () => {
    const wrapper = mountExport()
    await wrapper.findAll('.export-popover .button-stub').at(-1)?.trigger('click')
    expect(mockJob.start).toHaveBeenCalledWith(expect.objectContaining({ format: 'webm', preset: 'medium' }))

    const result = mockJob.state?.result as Ref<{ path: string; format: 'webm' | 'mp4' } | null>
    result.value = { path: 'C:\\Exports\\demo.webm', format: 'webm' }
    await nextTick()
    expect(wrapper.get('[role="status"]').text()).toContain('demo.webm')
    await wrapper.get('[role="status"] + .button-stub').trigger('click')
    expect((window.capture as unknown as { openFile: ReturnType<typeof vi.fn> }).openFile).toHaveBeenCalledWith('C:\\Exports\\demo.webm')
  })

  it('renders export progress, percentage, elapsed time and cancellation', async () => {
    const wrapper = mountExport()
    const progress = mockJob.state?.progress as Ref<Record<string, unknown> | null>
    const exporting = mockJob.state?.exporting as Ref<boolean>
    progress.value = { stageLabel: 'Encoding', completed: 5, total: 10, currentTimeMs: 61_000, totalTimeMs: 125_000 }
    exporting.value = true
    await nextTick()
    expect(wrapper.find('.export-progress-card').exists()).toBe(true)
    expect(wrapper.find('.percentage-badge').text()).toBe('50%')
    expect(wrapper.text()).toContain('01:01.0s')
    await wrapper.find('.export-progress-card .button-stub').trigger('click')
    expect(mockJob.cancel).toHaveBeenCalledOnce()
  })
})
