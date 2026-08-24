import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
  type CursorAutoHideSettings,
} from '~/api/types/cursor-settings';
import { MACOS_CURSOR_PACK } from '../properties/cursor/cursor-packs';
import type { BackgroundMediaGroup, BackgroundValue } from '../composables/backgroundCatalog';
import { DEFAULT_WATERMARK, type OutputCanvasSettings } from '../canvas/output-canvas';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import {
  emptyComposition as createEmptyComposition,
  type AudioClip,
  type CaptionClip,
  type ClipComposition,
} from '~/media/shared/composition-types';
import type { ZoomElement } from '../zoom/zoom-types';
import type { ShadowDirection } from '../properties/cursor/shadow-types';
import type { ProjectEditorData } from '../../../api/types/capture-api';

vi.mock('../../../api/capture', () => ({ capture: {} }));

import PropertiesPanel from '../properties/PropertiesPanel.vue';
import RealClipPropertiesPanel from '../properties/clip/ClipPropertiesPanel.vue';

const CanvasPanel = {
  props: ['showBackground', 'selectedBackground'],
  emits: ['update:selectedBackground', 'update:showBackground'],
  template: `
    <div
      class="canvas-panel-stub"
      :data-show-background="String(showBackground)"
      :data-selected-background="selectedBackground?.id || 'none'"
      @click="$emit('update:selectedBackground', { id: 'background' })"
    >
      Canvas
      <button
        class="remove-background-toggle"
        type="button"
        @click.stop="$emit('update:showBackground', !showBackground)"
      >
        Remove background
      </button>
    </div>
  `,
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
  template: `
    <div class="audio-clip-stub">
      {{ clip?.kind || "audio" }}
    </div>
  `,
};
const CaptionClipPanel = { template: '<div class="caption-clip-stub">Caption clip</div>' };
const CaptionPanel = {
  emits: ['update:composition'],
  template: `
    <div class="caption-panel-stub">
      <button class="caption-update" @click="$emit('update:composition', { assets: [], clips: [] })">
        Update
      </button>
    </div>
  `,
};
const CursorPanel = {
  props: ['autoHide'],
  emits: ['update:autoHide'],
  template: `
    <div class="cursor-panel-stub" :data-auto-hide="JSON.stringify(autoHide)">
      Cursor
      <button
        class="auto-hide-update"
        type="button"
        @click="$emit('update:autoHide', { enabled: true, delaySeconds: 4 })"
      >
        Update auto hide
      </button>
    </div>
  `,
};
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

const audioClip: AudioClip = {
  id: 'audio',
  kind: 'audio',
  name: 'Audio',
  timelineStartMs: 0,
  timelineDurationMs: 2_000,
  sourceInMs: 0,
  sourceDurationMs: 2_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  assetId: 'audio-asset',
  role: 'system',
  volume: 100,
};

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
const audioComposition: ClipComposition = {
  ...composition,
  assets: [
    {
      id: 'audio-asset',
      kind: 'audio',
      name: 'Audio',
      fileName: 'audio.wav',
      durationMs: 2_000,
      width: null,
      height: null,
      src: 'audio.wav',
      origin: 'project',
    },
  ],
  clips: [audioClip],
};
const noBackground: BackgroundValue | null = null;
const noZoom: ZoomElement | null = null;
const noEditorData: ProjectEditorData | null = null;
const canvas: OutputCanvasSettings = {
  preset: '16:9',
  width: 1920,
  height: 1080,
  showBackground: false,
};
const shadowDirection: ShadowDirection = 'bottom-right';
const autoHide: CursorAutoHideSettings = createDefaultCursorAutoHideSettings();

const baseProps = {
  activeTab: 'canvas',
  selectedClip: null,
  selectedCaptionClip: null,
  cursorSelection: { packId: 'builtin:macos', mode: 'fixed' as const, cursorId: 'default' },
  cursorPacks: [MACOS_CURSOR_PACK],
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: false,
  shadowBlur: 8,
  shadowColor: '#000000',
  shadowDirection,
  clickEffects: createDefaultCursorClickEffects(),
  motion: createDefaultCursorMotionSettings(),
  autoHide,
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

const layoutClip = (kind: 'screen' | 'video' | 'image' | 'webcam', overrides: Record<string, unknown> = {}) => ({
  id: `${kind}-layout`,
  kind,
  name: kind,
  timelineStartMs: 0,
  timelineDurationMs: 100,
  playbackRate: 1,
  enabled: true,
  isLinked: false,
  shadowSize: 'md',
  shadowColor: '#000000',
  shadowDirection: 'all',
  cornerRadius: 'sm',
  borderEnabled: false,
  clipTransform: { x: 0, y: 0, width: 1, height: 0.5 },
  isMirrored: false,
  isMirroredY: false,
  cameraLayoutPreset: 'custom' as const,
  cameraFramingPreset: 'custom' as const,
  cameraSplitRatio: 0.5,
  cameraSplitPadding: 0,
  hasLinkedScreen: true,
  ...overrides,
});

const mountRealClipPropertiesPanel = (selectedClip: ReturnType<typeof layoutClip>) =>
  mount(RealClipPropertiesPanel, {
    props: { selectedClip },
    global: {
      stubs: {
        BigSlider: true,
        ColorPicker: true,
        ShadowDirectionGroup: true,
        BorderAndFrameControls: true,
      },
    },
  });

const transitionComposition: ClipComposition = {
  ...createEmptyComposition(),
  assets: [
    {
      id: 'screen-asset',
      kind: 'video',
      name: 'Video',
      fileName: null,
      durationMs: 100,
      width: 1920,
      height: 1080,
      src: '',
      origin: 'session',
    },
  ],
  clips: [transitionScreenClip],
};

const mountTransitionPropertiesPanel = (overrides: Record<string, unknown> = {}, useRealTransitions = false) =>
  mount(PropertiesPanel, {
    props: {
      ...baseProps,
      activeTab: 'clip',
      selectedClip: transitionScreenClip,
      composition: transitionComposition,
      ...overrides,
    },
    global: useRealTransitions ? { ...global, stubs: { ...global.stubs, transition: false } } : global,
  });

describe('PropertiesPanel', () => {
  it.each(['screen', 'video', 'image'] as const)(
    'shows six non-split layouts and seven framings for %s clips',
    (kind) => {
      const wrapper = mountRealClipPropertiesPanel(layoutClip(kind));
      const panel = wrapper.get('.camera-layout-panel');
      const layoutIds = panel
        .findAll('.layout-preview')
        .map((preview) =>
          preview.classes().find((className) => className.startsWith('layout-') && className !== 'layout-preview'),
        );

      expect(layoutIds).toEqual([
        'layout-floating-top-left',
        'layout-floating-top-right',
        'layout-floating-bottom-left',
        'layout-floating-bottom-right',
        'layout-floating-center',
        'layout-fullscreen',
      ]);
      expect(panel.findAll('.btn-group button')).toHaveLength(7);
      expect(panel.find('.split-adjustment').exists()).toBe(false);
    },
  );

  it('keeps all ten layouts and split adjustments for webcam clips', () => {
    const wrapper = mountRealClipPropertiesPanel(
      layoutClip('webcam', { cameraLayoutPreset: 'split-left', hasLinkedScreen: true }),
    );
    const panel = wrapper.get('.camera-layout-panel');

    expect(panel.findAll('.layout-button')).toHaveLength(10);
    expect(panel.findAll('.btn-group button')).toHaveLength(7);
    expect(panel.find('.split-adjustment').exists()).toBe(true);
    expect(panel.findAll('input[type="range"]')).toHaveLength(2);
  });

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

  it('shows one standalone Canvas transition button and updates canvas transitions through the shared panel', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: {
        ...baseProps,
        activeTab: 'canvas',
        canvas: { ...canvas, transitions: { entry: null, exit: null } },
      },
      global,
    });

    const headerButtons = wrapper.findAll('.panel-header-view > .btn-group button');
    expect(headerButtons).toHaveLength(1);
    expect(headerButtons[0]!.attributes('aria-label')).toBe('Canvas transitions');

    await headerButtons[0]!.trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Canvas transitions');
    expect(wrapper.find('.transitions-panel').exists()).toBe(true);

    await wrapper.findAll('.preset-card')[1]!.trigger('click');
    expect(wrapper.emitted('update:canvas')).toContainEqual([
      expect.objectContaining({
        transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null },
      }),
    ]);
  });

  it('opens the shared Canvas transition panel on entry and preserves it when editing exit', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: {
        ...baseProps,
        activeTab: 'canvas',
        canvas: {
          ...canvas,
          transitions: { entry: { preset: { kind: 'fade' }, durationMs: 200 }, exit: null },
        },
      },
      global,
    });

    await wrapper.get('[aria-label="Canvas transitions"]').trigger('click');
    const edgeButtons = wrapper.findAll('.edge-selector button');
    expect(edgeButtons[0]!.attributes('aria-pressed')).toBe('true');

    await edgeButtons[1]!.trigger('click');
    expect(edgeButtons[1]!.attributes('aria-pressed')).toBe('true');
    await wrapper.findAll('.preset-card')[1]!.trigger('click');

    expect(wrapper.emitted('update:canvas')).toContainEqual([
      expect.objectContaining({
        transitions: {
          entry: { preset: { kind: 'fade' }, durationMs: 200 },
          exit: { preset: { kind: 'fade' }, durationMs: 500 },
        },
      }),
    ]);
  });

  it('reflects an incoming Canvas transition preview in the shared duration slider without committing it', async () => {
    const initialCanvas: OutputCanvasSettings = {
      ...canvas,
      transitions: { entry: { preset: { kind: 'fade' }, durationMs: 200 }, exit: null },
    };
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'canvas', canvas: initialCanvas },
      global,
    });

    await wrapper.get('[aria-label="Canvas transitions"]').trigger('click');
    expect(wrapper.get('.big-slider-value').text()).toBe('200 ms');

    await wrapper.setProps({
      canvas: {
        ...initialCanvas,
        transitions: { entry: { preset: { kind: 'fade' }, durationMs: 600 }, exit: null },
      },
    });
    expect(wrapper.get('.big-slider-value').text()).toBe('600 ms');
    expect(wrapper.emitted('update:canvas')).toBeUndefined();
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
      composition: audioComposition,
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

  it('renders audio actions in the header and opens audio transitions with None and Fade', async () => {
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, activeTab: 'clip', selectedClip: audioClip, composition: audioComposition },
      global,
    });

    const buttons = wrapper.findAll('.panel-header-actions button');
    expect(buttons).toHaveLength(3);

    await buttons[0]!.trigger('click');
    expect(wrapper.emitted('update:clip-enabled')).toEqual([[false]]);
    await buttons[2]!.trigger('click');
    expect(wrapper.emitted('delete-clip')).toHaveLength(1);

    await buttons[1]!.trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Audio Transitions');
    expect(wrapper.findAll('.preset-card-info strong').map((label) => label.text())).toEqual(['None', 'Fade']);
    expect(wrapper.get('.duration-control').text()).toContain('Select a transition');

    await wrapper.findAll('.preset-card')[1]!.trigger('click');
    expect(wrapper.emitted('update:composition')).toContainEqual([
      expect.objectContaining({
        clips: [
          expect.objectContaining({
            transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null },
          }),
        ],
      }),
    ]);

    await wrapper.setProps({
      composition: {
        ...audioComposition,
        clips: [{ ...audioClip, transitions: { entry: { preset: { kind: 'fade' }, durationMs: 500 }, exit: null } }],
      },
    });
    expect(wrapper.find('.duration-slider').exists()).toBe(true);
    expect(wrapper.get('.big-slider-value').text()).toBe('500 ms');
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
    const wrapper = mountTransitionPropertiesPanel();

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Video Transitions');
    expect(wrapper.find('.transitions-header').exists()).toBe(false);
    await wrapper.setProps({ selectedClip: { ...transitionScreenClip, name: 'Video refreshed' } });
    expect(wrapper.get('.panel-title').text()).toBe('Video Transitions');
    expect(wrapper.find('.transitions-panel').exists()).toBe(true);
    wrapper.unmount();
  });

  it('opens Clip Transitions forward and closes with Backward navigation', async () => {
    const wrapper = mountTransitionPropertiesPanel();

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Video Transitions');
    expect(wrapper.find('.transitions-panel').exists()).toBe(true);

    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.get('.panel-title').text()).toBe('Video');
    expect(wrapper.find('.transitions-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uses directional transition classes when the panel view changes', async () => {
    const wrapper = mountTransitionPropertiesPanel({}, true);

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    expect(wrapper.find('.properties-panel-forward-leave-active').exists()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 220));
    await nextTick();
    await wrapper.get('[aria-label="Back"]').trigger('click');
    expect(wrapper.find('.properties-panel-backward-leave-active').exists()).toBe(true);
    wrapper.unmount();
  });

  it('maps mouse back and forward buttons to transition history and prevents browser navigation', async () => {
    const wrapper = mountTransitionPropertiesPanel();

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    await wrapper.get('[aria-label="Back"]').trigger('click');

    const forward = new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true });
    window.dispatchEvent(forward);
    await nextTick();
    expect(forward.defaultPrevented).toBe(true);
    expect(wrapper.find('.transitions-panel').exists()).toBe(true);

    const back = new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true });
    window.dispatchEvent(back);
    await nextTick();
    expect(back.defaultPrevented).toBe(true);
    expect(wrapper.find('.transitions-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ['active tab', { activeTab: 'canvas' }],
    ['selected clip', { selectedClip: { ...transitionScreenClip, id: 'other-clip', name: 'Other' } }],
  ])('invalidates forward transition history when the %s changes', async (_label, overrides) => {
    const wrapper = mountTransitionPropertiesPanel();

    await wrapper.get('[aria-label="Clip transitions"]').trigger('click');
    await wrapper.get('[aria-label="Back"]').trigger('click');
    await wrapper.setProps(overrides);
    await nextTick();

    const forward = new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true });
    window.dispatchEvent(forward);
    await nextTick();

    expect(forward.defaultPrevented).toBe(true);
    expect(wrapper.find('.transitions-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([3, 4])('prevents default for auxiliary mouse button %s events', (button) => {
    const wrapper = mountTransitionPropertiesPanel();
    const event = new MouseEvent('auxclick', { button, bubbles: true, cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('uses the active tool name when no timeline clip is selected', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    expect(wrapper.get('.panel-title').text()).toBe('Canvas');
    expect(wrapper.find('.panel-header-actions').exists()).toBe(false);

    await wrapper.setProps({ activeTab: 'cursor' });
    expect(wrapper.get('.panel-title').text()).toBe('Cursor');
  });

  it('forwards cursor auto-hide settings and emits updates from the cursor panel', async () => {
    const wrapper = mount(PropertiesPanel, { props: { ...baseProps, activeTab: 'cursor' }, global });
    const cursorPanel = wrapper.get('.cursor-panel-stub');

    expect(JSON.parse(cursorPanel.attributes('data-auto-hide') ?? '')).toEqual(autoHide);

    await cursorPanel.get('.auto-hide-update').trigger('click');
    expect(wrapper.emitted('update:autoHide')).toEqual([[{ enabled: true, delaySeconds: 4 }]]);
  });

  it('forwards child events through the parent contract', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    await wrapper.get('.canvas-panel-stub').trigger('click');
    expect(wrapper.emitted('update:selectedBackground')).toEqual([[{ id: 'background' }]]);
  });

  it('forwards Remove Background while preserving the rest of the canvas settings', async () => {
    const canvasWithWatermark: OutputCanvasSettings = {
      ...canvas,
      showBackground: true,
      watermark: { ...DEFAULT_WATERMARK, enabled: true },
    };
    const wrapper = mount(PropertiesPanel, {
      props: { ...baseProps, canvas: canvasWithWatermark },
      global,
    });
    const canvasPanel = wrapper.get('.canvas-panel-stub');

    expect(canvasPanel.attributes('data-show-background')).toBe('true');
    await canvasPanel.get('.remove-background-toggle').trigger('click');

    expect(wrapper.emitted('update:canvas')).toEqual([[{ ...canvasWithWatermark, showBackground: false }]]);
  });

  it('forwards final composition updates from the caption panel', async () => {
    const wrapper = mount(PropertiesPanel, { props: { ...baseProps, activeTab: 'caption' }, global });

    await wrapper.get('.caption-update').trigger('click');

    expect(wrapper.emitted('update:composition')).toEqual([[{ assets: [], clips: [] }]]);
  });

  it('renders a ScrollShadow container for panel content', () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });
    expect(wrapper.findComponent({ name: 'ScrollShadow' }).exists()).toBe(true);
    expect(wrapper.find('.panel-body').exists()).toBe(true);
  });
});
