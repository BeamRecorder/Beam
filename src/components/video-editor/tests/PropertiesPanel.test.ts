import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultCursorClickEffects, createDefaultCursorMotionSettings } from '~/api/types/cursor-settings';
import type { CursorType } from '~/api/types/cursor-presentation';
import type { BackgroundMediaGroup, BackgroundValue } from '../composables/backgroundCatalog';
import type { OutputCanvasSettings } from '../canvas/output-canvas';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
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
const AudioPanel = {
  props: ['hasSystemAudio', 'hasMicAudio'],
  emits: ['delete:system', 'delete:microphone'],
  template: `
    <div
      class="audio-panel-stub"
      :data-has-system-audio="hasSystemAudio"
      :data-has-mic-audio="hasMicAudio"
    >
      Audio
      <button class="delete-system-audio" @click="$emit('delete:system')">Delete system</button>
      <button class="delete-microphone-audio" @click="$emit('delete:microphone')">Delete microphone</button>
    </div>
  `,
};
const ZoomPanel = { template: '<div class="zoom-panel-stub">Zoom</div>' };
const SettingsPanel = { template: '<div class="settings-panel-stub">Settings</div>' };
const AudioClipPropertiesPanel = {
  props: ['clip'],
  emits: ['update:enabled', 'delete'],
  template: `
    <div class="audio-clip-stub">
      {{ clip?.kind || "audio" }}
      <button class="audio-toggle" @click="$emit('update:enabled', false)">Toggle</button>
      <button class="audio-delete" @click="$emit('delete')">Delete</button>
    </div>
  `,
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
      ...createDefaultCaptionStyle(36),
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
const transitionScreenClip = {
  ...screenClip,
  name: 'Video',
  sourceInMs: 0,
  sourceDurationMs: 100,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  trackId: 'screen-track',
  assetId: 'screen-asset',
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
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

  it('passes audio track presence to the audio panel and forwards role deletions', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'audio', hasSystemAudio: true, hasMicAudio: false },
      global,
    });
    const audio = wrapper.get('.audio-panel-stub');

    expect(audio.attributes('data-has-system-audio')).toBe('true');
    expect(audio.attributes('data-has-mic-audio')).toBe('false');
    await wrapper.get('.delete-system-audio').trigger('click');
    expect(wrapper.emitted('delete:system-audio')).toEqual([[]]);

    await wrapper.setProps({ hasSystemAudio: false, hasMicAudio: true });
    expect(audio.attributes('data-has-system-audio')).toBe('false');
    expect(audio.attributes('data-has-mic-audio')).toBe('true');
    await wrapper.get('.delete-microphone-audio').trigger('click');
    expect(wrapper.emitted('delete:mic-audio')).toEqual([[]]);
  });

  it('selects audio, caption and regular clip property editors', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    await wrapper.setProps({
      activeTab: 'clip',
      selectedClip: audioClip,
    });
    expect(wrapper.find('.audio-clip-stub').exists()).toBe(true);
    expect(wrapper.find('.panel-header-actions').exists()).toBe(false);

    await wrapper.get('.audio-toggle').trigger('click');
    expect(wrapper.emitted('update:clip-enabled')).toEqual([[false]]);
    await wrapper.get('.audio-delete').trigger('click');
    expect(wrapper.emitted('delete-clip')).toHaveLength(1);

    await wrapper.setProps({ selectedClip: null, selectedCaptionClip: captionClip });
    expect(wrapper.find('.caption-clip-stub').exists()).toBe(true);
    await wrapper.setProps({
      selectedCaptionClip: null,
      selectedClip: screenClip,
    });
    expect(wrapper.find('.clip-panel-stub').text()).toBe('video');
  });

  it('keeps non-audio clip actions in the header and toggles/deletes them', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'clip', selectedClip: screenClip },
      global,
    });

    expect(wrapper.get('.panel-title').text()).toBe('Video');
    const buttons = wrapper.findAll('.panel-header-actions button');
    expect(buttons).toHaveLength(3);

    // Toggle visibility
    await buttons[0].trigger('click');
    expect(wrapper.emitted('update:clip-enabled')).toEqual([[false]]);

    // Delete clip with dynamic video tooltip
    await buttons[2].trigger('click');
    expect(wrapper.emitted('delete-clip')).toHaveLength(1);

    await wrapper.setProps({ selectedClip: webcamClip });
    expect(wrapper.get('.panel-title').text()).toBe('Webcam');

    // Zoom deletion in header
    await wrapper.setProps({
      activeTab: 'zoom',
      selectedClip: null,
      selectedZoom: { id: 'zoom-1', startMs: 0, durationMs: 1000, depth: 2, mode: 'auto' } as any,
    });
    expect(wrapper.get('.panel-title').text()).toBe('Zoom');
    const zoomButtons = wrapper.findAll('.panel-header-actions button');
    expect(zoomButtons).toHaveLength(1);
    await zoomButtons[0].trigger('click');
    expect(wrapper.emitted('delete:zoom')).toHaveLength(1);
  });

  it('uses the real top bar for transitions and stays open when the selected clip object refreshes', async () => {
    const transitionComposition: ClipComposition = {
      ...createEmptyComposition(),
      assets: [{ id: 'screen-asset', kind: 'video', name: 'Video', fileName: null, durationMs: 100, width: 1920, height: 1080, src: '', origin: 'session' }],
      clips: [transitionScreenClip],
    };
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'clip', selectedClip: transitionScreenClip, composition: transitionComposition },
      global,
    });

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Video Transitions');
    expect(wrapper.find('.transitions-header').exists()).toBe(false);
    await wrapper.setProps({ selectedClip: { ...transitionScreenClip, name: 'Video refreshed' } });
    expect(wrapper.get('.panel-title').text()).toBe('Video Transitions');
    expect(wrapper.find('.transitions-panel').exists()).toBe(true);
  });

  it('uses the active tool name when no timeline clip is selected', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    expect(wrapper.get('.panel-title').text()).toBe('Canvas');
    expect(wrapper.find('.panel-header-actions').exists()).toBe(false);

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

  it('renders a ScrollShadow container for panel content', () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    expect(wrapper.findComponent({ name: 'ScrollShadow' }).exists()).toBe(true);
    expect(wrapper.find('.panel-body').exists()).toBe(true);
  });
});
