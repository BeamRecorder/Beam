import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultCursorClickEffects, createDefaultCursorMotionSettings } from '~/api/types/cursor-settings';
import type { CursorType } from '~/api/types/cursor-presentation';
import type { BackgroundMediaGroup, BackgroundValue } from '../composables/backgroundCatalog';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import {
  emptyComposition as createEmptyComposition,
  type CaptionClip,
  type ClipComposition,
} from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ShadowDirection } from '../properties/cursor/shadow-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';

vi.mock('../../../api/capture', () => ({ capture: {} }));

import PropertiesPanel from '../properties/PropertiesPanel.vue';

const CanvasPanel = {
  emits: ['update:selectedBackground'],
  template:
    '<button class="canvas-panel-stub" @click="$emit(\'update:selectedBackground\', { id: \'background\' })">Canvas</button>',
};
const AudioPanel = { template: '<div class="audio-panel-stub">Audio</div>' };
const ZoomPanel = { template: '<div class="zoom-panel-stub">Zoom</div>' };
const SettingsPanel = { template: '<div class="settings-panel-stub">Settings</div>' };
const AudioClipPropertiesPanel = {
  props: ['clip'],
  template: '<div class="audio-clip-stub">{{ clip?.kind || "audio" }}</div>',
};
const CaptionClipPanel = { template: '<div class="caption-clip-stub">Caption clip</div>' };
const CaptionPanel = {
  emits: ['preview:composition', 'update:composition'],
  template: `
    <div class="caption-panel-stub">
      <button class="caption-preview" @click="$emit('preview:composition', { assets: [], clips: [] })">
        Preview
      </button>
      <button class="caption-update" @click="$emit('update:composition', { assets: [], clips: [] })">
        Update
      </button>
    </div>
  `,
};
const CursorPanel = { template: '<div class="cursor-panel-stub">Cursor</div>' };
const ClipPropertiesPanel = {
  props: ['selectedClip'],
  template: '<div class="clip-panel-stub">{{ selectedClip?.kind }}</div>',
};

const captionClip: CaptionClip = {
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 100,
  sourceInMs: 0,
  sourceDurationMs: 100,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [],
    style: {
      color: '#ffffff',
      fontSize: 24,
      wrap: true,
      shadowColor: '#000000',
      shadowBlur: 0,
      placement: 'center',
      backdropBlur: 0,
      outlineColor: '#000000',
      outlineWidth: 0,
      extrusionDepth: 0,
    },
  },
};

const audioClip = {
  id: 'audio',
  kind: 'audio',
  name: 'Audio',
  timelineStartMs: 0,
  timelineDurationMs: 100,
} as const;

const screenClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  timelineStartMs: 0,
  timelineDurationMs: 100,
} as const;

const webcamClip = {
  id: 'webcam',
  kind: 'webcam',
  name: 'Webcam',
  timelineStartMs: 0,
  timelineDurationMs: 100,
  enabled: false,
} as const;

const emptyBackgroundGroups: BackgroundMediaGroup[] = [];
const composition: ClipComposition = createEmptyComposition();
const noBackground: BackgroundValue | null = null;
const noZoom: ZoomElement | null = null;
const noEditorData: ProjectEditorData | null = null;
const canvas: OutputCanvasSettings = {
  preset: '16:9',
  width: 1920,
  height: 1080,
  showBackground: false,
};
const selectedCursor: CursorType = 'default';
const shadowDirection: ShadowDirection = 'bottom-right';

const baseProps = {
  activeTab: 'canvas',
  selectedClip: null,
  selectedCaptionClip: null,
  selectedCursor,
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: false,
  shadowBlur: 8,
  shadowColor: '#000000',
  shadowDirection,
  clickEffects: createDefaultCursorClickEffects(),
  motion: createDefaultCursorMotionSettings(),
  volume: 100,
  isSystemAudioEnabled: false,
  isMicAudioEnabled: false,
  selectedBackground: noBackground,
  blurPercent: 0,
  backgroundGroups: emptyBackgroundGroups,
  selectedZoom: noZoom,
  canGenerateZooms: false,
  hasAutomaticZooms: false,
  composition,
  editorData: noEditorData,
  timelineDurationMs: 1000,
  projectId: null,
  canvas,
};

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
};

describe('PropertiesPanel', () => {
  it('selects the correct child panel for every editor tab', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    const cases = [
      ['canvas', '.canvas-panel-stub'],
      ['audio', '.audio-panel-stub'],
      ['zoom', '.zoom-panel-stub'],
      ['settings', '.settings-panel-stub'],
      ['cursor', '.cursor-panel-stub'],
      ['caption', '.caption-panel-stub'],
    ] as const;
    for (const [tab, selector] of cases) {
      await wrapper.setProps({ activeTab: tab });
      expect(wrapper.find(selector).exists()).toBe(true);
    }
  });

  it('selects audio, caption and regular clip property editors', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    await wrapper.setProps({
      activeTab: 'clip',
      selectedClip: audioClip,
    });
    expect(wrapper.find('.audio-clip-stub').exists()).toBe(true);
    await wrapper.setProps({ selectedClip: null, selectedCaptionClip: captionClip });
    expect(wrapper.find('.caption-clip-stub').exists()).toBe(true);
    await wrapper.setProps({
      selectedCaptionClip: null,
      selectedClip: screenClip,
    });
    expect(wrapper.find('.clip-panel-stub').text()).toBe('video');
  });

  it('shows the selected item in the header and toggles it through the shared clip state', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'clip', selectedClip: screenClip },
      global,
    });

    expect(wrapper.get('.panel-title').text()).toBe('Video');
    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes('aria-label')).toBe('Video');
    expect(toggle.attributes('aria-checked')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.emitted('update:clip-enabled')).toEqual([[false]]);

    await wrapper.setProps({ selectedClip: webcamClip });
    expect(wrapper.get('.panel-title').text()).toBe('Webcam');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  });

  it('uses the active tool name when no timeline clip is selected', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    expect(wrapper.get('.panel-title').text()).toBe('Canvas');
    expect(wrapper.find('[role="switch"]').exists()).toBe(false);

    await wrapper.setProps({ activeTab: 'cursor' });
    expect(wrapper.get('.panel-title').text()).toBe('Cursor');
  });

  it('forwards child events through the parent contract', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    await wrapper.get('.canvas-panel-stub').trigger('click');
    expect(wrapper.emitted('update:selectedBackground')).toEqual([[{ id: 'background' }]]);
  });

  it('forwards composition previews separately from final composition updates', async () => {
    const wrapper = mount(PropertiesPanel, { props: { ...baseProps, activeTab: 'caption' }, global });

    await wrapper.get('.caption-preview').trigger('click');
    await wrapper.get('.caption-update').trigger('click');

    expect(wrapper.emitted('preview:composition')).toEqual([[{ assets: [], clips: [] }]]);
    expect(wrapper.emitted('update:composition')).toEqual([[{ assets: [], clips: [] }]]);
  });
});
