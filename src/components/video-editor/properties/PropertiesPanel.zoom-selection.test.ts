import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/capture', () => ({ capture: {} }));

import PropertiesPanel from './PropertiesPanel.vue';

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (component: string) => ({
    t: (key: string) => {
      if (component === 'TimelineTracks' && key === 'zooms') return 'Zooms';
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
});
