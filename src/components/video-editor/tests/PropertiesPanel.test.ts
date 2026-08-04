import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../api/capture', () => ({ capture: {} }))

import PropertiesPanel from './PropertiesPanel.vue'

const CanvasPanel = {
  emits: ['update:selectedBackground'],
  template:
    '<button class="canvas-panel-stub" @click="$emit(\'update:selectedBackground\', { id: \'background\' })">Canvas</button>',
}
const AudioPanel = { template: '<div class="audio-panel-stub">Audio</div>' }
const ZoomPanel = { template: '<div class="zoom-panel-stub">Zoom</div>' }
const SettingsPanel = { template: '<div class="settings-panel-stub">Settings</div>' }
const AudioClipPropertiesPanel = {
  props: ['clip'],
  template: '<div class="audio-clip-stub">{{ clip?.kind || "audio" }}</div>',
}
const CaptionClipPanel = { template: '<div class="caption-clip-stub">Caption clip</div>' }
const CaptionPanel = { template: '<div class="caption-panel-stub">Captions</div>' }
const CursorPanel = { template: '<div class="cursor-panel-stub">Cursor</div>' }
const ClipPropertiesPanel = {
  props: ['selectedClip'],
  template: '<div class="clip-panel-stub">{{ selectedClip?.kind }}</div>',
}

const baseProps = {
  activeTab: 'canvas',
  selectedClip: null,
  selectedCaptionClip: null,
  selectedCursor: 'default',
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: false,
  shadowBlur: 8,
  shadowColor: '#000000',
  shadowDirection: 'bottom-right',
  clickEffects: {} as never,
  motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
  volume: 100,
  isSystemAudioEnabled: false,
  isMicAudioEnabled: false,
  selectedBackground: null,
  blurPercent: 0,
  backgroundGroups: [],
  selectedZoom: null,
  canGenerateZooms: false,
  hasAutomaticZooms: false,
  composition: { assets: [], clips: [] },
  editorData: null,
  timelineDurationMs: 1000,
  projectId: null,
  canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: false },
}

const global = {
  stubs: {
    CanvasPanel,
    AudioPanel,
    ZoomPanel,
    SettingsPanel,
    AudioClipPropertiesPanel,
    CaptionClipPanel,
    CaptionPanel,
    CursorPanel,
    ClipPropertiesPanel,
  },
}

describe('PropertiesPanel', () => {
  it('selects the correct child panel for every editor tab', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global })
    const cases = [
      ['canvas', '.canvas-panel-stub'],
      ['audio', '.audio-panel-stub'],
      ['zoom', '.zoom-panel-stub'],
      ['settings', '.settings-panel-stub'],
      ['cursor', '.cursor-panel-stub'],
      ['caption', '.caption-panel-stub'],
    ] as const
    for (const [tab, selector] of cases) {
      await wrapper.setProps({ activeTab: tab })
      expect(wrapper.find(selector).exists()).toBe(true)
    }
  })

  it('selects audio, caption and regular clip property editors', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global })
    await wrapper.setProps({
      activeTab: 'clip',
      selectedClip: { id: 'audio', kind: 'audio', timelineStartMs: 0, timelineDurationMs: 100 },
    })
    expect(wrapper.find('.audio-clip-stub').exists()).toBe(true)
    await wrapper.setProps({ selectedClip: null, selectedCaptionClip: { id: 'caption' } })
    expect(wrapper.find('.caption-clip-stub').exists()).toBe(true)
    await wrapper.setProps({
      selectedCaptionClip: null,
      selectedClip: { id: 'screen', kind: 'screen', timelineStartMs: 0, timelineDurationMs: 100 },
    })
    expect(wrapper.find('.clip-panel-stub').text()).toBe('video')
  })

  it('forwards child events through the parent contract', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global })
    await wrapper.get('.canvas-panel-stub').trigger('click')
    expect(wrapper.emitted('update:selectedBackground')).toEqual([[{ id: 'background' }]])
  })
})
