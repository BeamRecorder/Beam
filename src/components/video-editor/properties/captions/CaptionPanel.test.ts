import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => ({
  whisperModels: vi.fn(),
  downloadWhisperModel: vi.fn(),
  onWhisperProgress: vi.fn(),
}))
const whisper = vi.hoisted(() => ({
  progress: { status: 'idle', message: '', progress: undefined as number | undefined },
  transcribe: vi.fn(),
}))
const createComposition = vi.hoisted(() => vi.fn((assets, clips) => ({ schemaVersion: 1, assets, clips })))

vi.mock('../../../../api/capture', () => ({ capture }))
vi.mock('../../captions/useWhisperTranscription', () => ({ useWhisperTranscription: () => whisper }))
vi.mock('../../composition/engine/clip-engine', () => ({ createComposition }))

import CaptionPanel from './CaptionPanel.vue'

const Button = {
  inheritAttrs: true,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
}
const Select = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button class="caption-select" @click="$emit(\'update:modelValue\', modelValue)">Select</button>',
}
const ProgressBar = { template: '<div class="progress-stub" />' }

const audioComposition = {
  schemaVersion: 1,
  assets: [
    {
      id: 'audio-1',
      kind: 'audio',
      name: 'System audio',
      fileName: null,
      durationMs: 2000,
      width: null,
      height: null,
      src: 'audio://system',
      origin: 'session',
      sessionId: 'session-1',
    },
  ],
  clips: [
    {
      id: 'audio-clip',
      kind: 'audio',
      name: 'System audio',
      assetId: 'audio-1',
      role: 'system',
      timelineStartMs: 0,
      timelineDurationMs: 2000,
      sourceInMs: 0,
      sourceDurationMs: 2000,
      playbackRate: 1,
      enabled: true,
      order: 0,
      volume: 1,
    },
  ],
}

const aiCaption = {
  id: 'caption-old',
  kind: 'caption',
  name: 'Old AI caption',
  timelineStartMs: 0,
  timelineDurationMs: 300,
  sourceInMs: 0,
  sourceDurationMs: 300,
  playbackRate: 1,
  enabled: true,
  order: 1,
  isAiGenerated: true,
  caption: {
    sentences: [],
    style: { color: '#fff', fontSize: 36, shadowColor: '#000', shadowBlur: 8, placement: 'bottom' },
  },
}

describe('CaptionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whisper.progress.status = 'idle'
    whisper.progress.message = ''
    whisper.progress.progress = undefined
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'missing', downloadedBytes: 0, totalBytes: 100 },
    ])
    capture.downloadWhisperModel.mockResolvedValue(undefined)
    capture.onWhisperProgress.mockReturnValue(() => undefined)
    whisper.transcribe.mockResolvedValue({ words: [], sentences: [] })
  })

  it('loads a missing model, displays progress/errors and downloads it', async () => {
    let progressListener!: (event: { id: string; downloadedBytes: number; totalBytes: number | null }) => void
    capture.onWhisperProgress.mockImplementation((listener) => {
      progressListener = listener
      return () => undefined
    })
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs: { Button, Select, ProgressBar } },
    })
    await vi.waitFor(() => expect(capture.whisperModels).toHaveBeenCalledOnce())
    expect(wrapper.find('.sub-group').exists()).toBe(true)
    expect(wrapper.find('button[variant="primary"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[variant="secondary"]').trigger('click')
    await vi.waitFor(() => expect(capture.downloadWhisperModel).toHaveBeenCalledWith('Xenova/whisper-tiny'))
    progressListener({ id: 'Xenova/whisper-tiny', downloadedBytes: 50, totalBytes: 100 })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.progress-block').exists()).toBe(true)

    capture.downloadWhisperModel.mockRejectedValueOnce(new Error('disk full'))
    await wrapper.get('button[variant="secondary"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.error-text').text()).toContain('disk full'))
  })

  it('generates captions, replaces old AI captions, and exposes the edit action', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ])
    whisper.transcribe.mockResolvedValue({
      words: [],
      sentences: [{ id: 'sentence-1', text: 'Hello', startMs: 100, endMs: 120 }],
    })
    const wrapper = mount(CaptionPanel, {
      props: {
        composition: { ...audioComposition, clips: [...audioComposition.clips, aiCaption] },
        timelineDurationMs: 2000,
      },
      global: { stubs: { Button, Select, ProgressBar } },
    })
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true))
    expect(wrapper.text()).toContain('1 subtitle track')
    await wrapper.get('button[variant="primary"]').trigger('click')
    await vi.waitFor(() =>
      expect(whisper.transcribe).toHaveBeenCalledWith('audio://system', 'Xenova/whisper-tiny', 2000),
    )
    expect(createComposition).toHaveBeenCalled()
    expect(wrapper.emitted('update:composition')).toHaveLength(1)
    expect(wrapper.emitted('select-caption')).toHaveLength(1)
    await wrapper.get('button[variant="ghost"]').trigger('click')
    expect(wrapper.emitted('select-caption')).toHaveLength(2)
  })

  it('does nothing when transcription returns no sentences', async () => {
    capture.whisperModels.mockResolvedValue([
      { id: 'Xenova/whisper-tiny', status: 'ready', downloadedBytes: 100, totalBytes: 100 },
    ])
    const wrapper = mount(CaptionPanel, {
      props: { composition: audioComposition, timelineDurationMs: 2000 },
      global: { stubs: { Button, Select, ProgressBar } },
    })
    await vi.waitFor(() => expect(wrapper.find('.model-ready-text').exists()).toBe(true))
    await wrapper.get('button[variant="primary"]').trigger('click')
    await vi.waitFor(() => expect(whisper.transcribe).toHaveBeenCalled())
    expect(wrapper.emitted('update:composition')).toBeUndefined()
  })
})
