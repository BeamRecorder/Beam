import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/capture', () => ({ capture: {} }));

import PropertiesPanel from './PropertiesPanel.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (component: string) => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (component === 'TimelineTracks' && key === 'zooms') return 'Zooms';
      if (component === 'TimelineTracks' && key === 'lockedMessage') {
        return `${String(params?.name ?? '')} is locked. Modifications are not possible.`;
      }
      if (component === 'TimelineToolbar' && key === 'zoom') return 'Zoom';
      return key;
    },
  }),
}));

const panelStub = { template: '<div />' };
const zoom = (id: string) =>
  ({
    id,
    sessionId: 'session',
    startMs: 0,
    endMs: 1_000,
    focus: { cx: 0.5, cy: 0.5 },
    depth: 2,
    mode: 'manual',
  }) as const;

const clip = (id: string, kind: 'blur' | 'color', name: string, locked = false) =>
  ({
    id,
    kind,
    name,
    locked,
    timelineStartMs: 0,
    timelineDurationMs: 1_000,
    sourceInMs: 0,
    sourceDurationMs: 1_000,
    playbackRate: 1,
    enabled: true,
    order: 0,
  }) as const;

const baseProps = {
  activeTab: 'zoom',
  selectedClip: null,
  selectedCaptionClip: null,
  cursorSelection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'default' },
  cursorPacks: [],
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: false,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowDirection: 'bottom-right',
  clickEffects: {},
  motion: {},
  autoHide: {},
  volume: 100,
  isSystemAudioEnabled: false,
  isMicAudioEnabled: false,
  selectedBackground: null,
  blurPercent: 0,
  backgroundGroups: [],
  selectedZoom: zoom('zoom-one'),
  selectedZoomIds: ['zoom-one', 'zoom-two'],
  canGenerateZooms: false,
  hasAutomaticZooms: false,
  composition: { assets: [], clips: [], schemaVersion: 1, keyboardCaptionSessions: [] },
  timelineDurationMs: 1_000,
  projectId: null,
  canvas: { preset: '16:9', width: 1_920, height: 1_080, showBackground: false },
} as any;

const global = {
  stubs: {
    CanvasPanel: panelStub,
    AudioPanel: panelStub,
    ZoomPanel: panelStub,
    SettingsPanel: panelStub,
    ClipPropertiesPanel: panelStub,
    AudioClipPropertiesPanel: panelStub,
    BlurPropertiesPanel: panelStub,
    GeneratedLayerPropertiesPanel: panelStub,
    CaptionPanel: panelStub,
    CaptionClipPanel: panelStub,
    KeyboardCaptionClipPanel: panelStub,
    ClipTransitionsPanel: panelStub,
    TransitionSettingsPanel: panelStub,
    CursorPanel: panelStub,
    ScrollShadow: { template: '<div><slot /></div>' },
  },
};

describe('PropertiesPanel zoom selection summary', () => {
  it('describes the number of selected zooms in the panel header', () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });

    expect(wrapper.get('.panel-title').text()).toBe('zoom');
    expect(wrapper.get('.selection-names').text()).toBe('2 Zooms');
  });

  it('does not show a multi-selection summary for one selected zoom', async () => {
    const wrapper = mount(PropertiesPanel, { props: baseProps, global });

    await wrapper.setProps({ selectedZoomIds: ['zoom-one'] });

    expect(wrapper.find('.selection-summary').exists()).toBe(false);
  });

  it('names only the locked clip when a locked blur is selected with a free color layer', () => {
    const blur = clip('blur-1', 'blur', 'Sensitive blur', true);
    const color = clip('color-1', 'color', 'Free color');
    const wrapper = mount(PropertiesPanel, {
      props: {
        ...baseProps,
        activeTab: 'clip',
        selectedClip: { ...blur, kind: 'blur' },
        selectedClipIds: [blur.id, color.id],
        composition: { ...baseProps.composition, clips: [blur, color] },
        lockedSelection: { clipIds: [blur.id], zoomIds: [] },
      },
      global,
    });

    expect(wrapper.get('.properties-lock-message').text()).toContain(
      'Sensitive blur is locked. Modifications are not possible.',
    );
    expect(wrapper.get('.properties-lock-message').text()).not.toContain('Free color');
  });

  it('removes the lock overlay when the selection becomes entirely free', async () => {
    const blur = clip('blur-1', 'blur', 'Sensitive blur', true);
    const color = clip('color-1', 'color', 'Free color');
    const wrapper = mount(PropertiesPanel, {
      props: {
        ...baseProps,
        activeTab: 'clip',
        selectedClip: { ...blur, kind: 'blur' },
        selectedClipIds: [blur.id, color.id],
        composition: { ...baseProps.composition, clips: [blur, color] },
        lockedSelection: { clipIds: [blur.id], zoomIds: [] },
      },
      global,
    });

    expect(wrapper.find('.properties-lock-message').exists()).toBe(true);

    await wrapper.setProps({
      selectedClip: { ...color, kind: 'color' },
      selectedClipIds: [color.id],
      lockedSelection: { clipIds: [], zoomIds: [] },
    });

    expect(wrapper.find('.properties-lock-message').exists()).toBe(false);
    expect(wrapper.find('.properties-lock-content.is-locked').exists()).toBe(false);
  });

  it('combines locked clip names with the count of locked zooms', () => {
    const blur = clip('blur-1', 'blur', 'Sensitive blur', true);
    const color = clip('color-1', 'color', 'Free color');
    const wrapper = mount(PropertiesPanel, {
      props: {
        ...baseProps,
        activeTab: 'zoom',
        selectedClipIds: [blur.id, color.id],
        selectedZoomIds: ['zoom-one', 'zoom-two', 'zoom-free'],
        composition: { ...baseProps.composition, clips: [blur, color] },
        lockedSelection: { clipIds: [blur.id], zoomIds: ['zoom-one', 'zoom-two'] },
      },
      global,
    });

    expect(wrapper.get('.properties-lock-message').text()).toContain('Sensitive blur, 2 Zooms');
    expect(wrapper.get('.properties-lock-message').text()).not.toContain('Free color');
  });
});
