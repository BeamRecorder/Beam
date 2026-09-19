import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import {
  createDefaultCursorAutoHideSettings,
  createDefaultCursorClickEffects,
  createDefaultCursorMotionSettings,
} from '~/api/types/cursor-settings';
import type {
  BlurClip,
  CaptionClip,
  Clip,
  ColorClip,
  MediaAsset,
  ShapeClip,
  VisualClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle, createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import { DEFAULT_COLOR_FILL } from '~/media/shared/color-fill-types';
import { normalizeColorLayerStyle } from '~/media/shared/color-layer-style';
import { createComposition } from '../composition/engine/clip-engine';
import { DEFAULT_DRAWING_SETTINGS } from '~/media/shared/freehand';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import type { ElementEditorContext } from '../elements/element-editor-types';
import { ELEMENT_EDITOR } from '../elements/useElementEditor';
import PropertiesPanel from './PropertiesPanel.vue';
import type { PropertiesPanelProps } from './properties-panel-contract-types';

vi.mock('../../../api/capture', () => ({ capture: {} }));

vi.mock('~/i18n/useTranslate', () => ({
  useTranslate: (component: string) => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (component === 'TimelineTracks' && key === 'lockedMessage') {
        return `${String(params?.name ?? '')} is locked. Modifications are not possible.`;
      }
      return key;
    },
  }),
}));

const makeBaseClip = (id: string) => ({
  id,
  trackId: id,
  name: id,
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
});

const makeShapeClip = (id: string, locked = false): ShapeClip => ({
  ...makeBaseClip(id),
  ...(locked ? { locked: true } : {}),
  kind: 'shape',
  assetId: '',
  ...normalizeShapeLayerStyle({ family: 'shape' }),
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
});

const makeImageClip = (id: string): VisualClip => ({
  ...makeBaseClip(id),
  kind: 'image',
  assetId: 'image-asset',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  appearance: createDefaultClipAppearance('image'),
  isMirrored: false,
  isMirroredY: false,
});

const makeColorClip = (id: string, locked = false): ColorClip => ({
  ...makeBaseClip(id),
  ...(locked ? { locked: true } : {}),
  kind: 'color',
  assetId: '',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  fill: DEFAULT_COLOR_FILL,
  ...normalizeColorLayerStyle(undefined),
});

const makeBlurClip = (id: string): BlurClip => ({
  ...makeBaseClip(id),
  kind: 'blur',
  assetId: '',
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  shape: 'rectangle',
  mode: 'blur',
  strength: 60,
  feather: 0,
  tintOpacity: 0,
  color: '#000000',
});

const makeManualCaption = (id: string): CaptionClip => ({
  ...makeBaseClip(id),
  kind: 'caption',
  caption: {
    type: 'text',
    sentences: [],
    style: { ...createDefaultCaptionStyle(), customText: 'Manual note' },
  },
});

const makeAsset = (id: string, kind: MediaAsset['kind']): MediaAsset => ({
  id,
  kind,
  name: id,
  fileName: null,
  durationMs: 1_000,
  width: kind === 'audio' ? null : 1_920,
  height: kind === 'audio' ? null : 1_080,
  src: `project-media:${id}`,
  origin: 'project',
});

const compositionFor = (...clips: Clip[]) => {
  const assets = new Map<string, MediaAsset>();
  for (const clip of clips) {
    if (clip.kind === 'image' && !assets.has('image-asset'))
      assets.set('image-asset', makeAsset('image-asset', 'image'));
  }
  return createComposition([...assets.values()], clips);
};

const baseProps = {
  activeTab: 'elements',
  selectedClip: null,
  selectedCaptionClip: null,
  selectedClipIds: [],
  selectedZoomIds: [],
  cursorSelection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'default' },
  cursorPacks: [],
  cursorSize: 24,
  cursorColor: '#000000',
  enableShadow: false,
  shadowBlur: 0,
  shadowColor: '#000000',
  shadowDirection: 'bottom-right',
  clickEffects: createDefaultCursorClickEffects(),
  motion: createDefaultCursorMotionSettings(),
  autoHide: createDefaultCursorAutoHideSettings(),
  volume: 100,
  isSystemAudioEnabled: false,
  isMicAudioEnabled: false,
  selectedBackground: null,
  blurPercent: 0,
  backgroundGroups: [],
  selectedZoom: null,
  canGenerateZooms: false,
  hasAutomaticZooms: false,
  composition: createComposition(),
  timelineDurationMs: 1_000,
  projectId: null,
  canvas: { preset: '16:9', width: 1_920, height: 1_080, showBackground: false },
} satisfies PropertiesPanelProps;

const marker = (name: string, selector: string) =>
  defineComponent({
    name,
    props: ['clip', 'composition', 'selectedClip', 'initialEdge'],
    template: `<div data-test="${selector}"></div>`,
  });

const globalStubs = {
  CanvasPanel: marker('CanvasPanel', 'canvas-panel'),
  AudioPanel: marker('AudioPanel', 'audio-panel'),
  ZoomPanel: marker('ZoomPanel', 'zoom-panel'),
  SettingsPanel: marker('SettingsPanel', 'settings-panel'),
  ClipPropertiesPanel: marker('ClipPropertiesPanel', 'clip-properties'),
  AudioClipPropertiesPanel: marker('AudioClipPropertiesPanel', 'audio-clip-properties'),
  BlurPropertiesPanel: marker('BlurPropertiesPanel', 'blur-properties'),
  GeneratedLayerPropertiesPanel: marker('GeneratedLayerPropertiesPanel', 'generated-layer-properties'),
  ShapeLayerPropertiesPanel: marker('ShapeLayerPropertiesPanel', 'shape-layer-properties'),
  CaptionPanel: marker('CaptionPanel', 'caption-panel'),
  CaptionClipPanel: marker('CaptionClipPanel', 'caption-clip-properties'),
  KeyboardCaptionClipPanel: marker('KeyboardCaptionClipPanel', 'keyboard-caption-properties'),
  ClipTransitionsPanel: marker('ClipTransitionsPanel', 'clip-transitions-panel'),
  TransitionSettingsPanel: marker('TransitionSettingsPanel', 'transition-settings-panel'),
  CursorPanel: marker('CursorPanel', 'cursor-panel'),
  ScrollShadow: { template: '<div><slot /></div>' },
};

const createEditor = (shape: ShapeClip | null, layers: ShapeClip[] = shape ? [shape] : []) => {
  const remove = vi.fn();
  const editor: ElementEditorContext = {
    canInteract: computed(() => true),
    layers: computed(() => layers),
    selected: computed(() => shape),
    editing: ref<ShapeClip | null>(null),
    drawingMode: ref(false),
    drawingSettings: ref({ ...DEFAULT_DRAWING_SETTINGS }),
    showLayers: false,
    add: vi.fn(),
    addHighlight: vi.fn(),
    addBlur: vi.fn(),
    addColor: vi.fn(),
    addImage: vi.fn(),
    addDrawing: vi.fn(),
    updateDrawingSettings: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    remove,
    beginText: vi.fn(() => true),
    updateText: vi.fn(),
    finishText: vi.fn(),
    cancelText: vi.fn(),
  };
  return { editor, remove };
};

const selectedClipProps = (clip: Exclude<Clip, CaptionClip>) => ({
  id: clip.id,
  kind: clip.kind,
  name: clip.name,
  timelineStartMs: clip.timelineStartMs,
  timelineDurationMs: clip.timelineDurationMs,
  enabled: clip.enabled,
  ...(clip.kind === 'blur'
    ? {
        blurMode: clip.mode,
        blurShape: clip.shape,
        blurStrength: clip.strength,
        blurFeather: clip.feather,
        blurTintOpacity: clip.tintOpacity,
        blurColor: clip.color,
      }
    : {}),
});

const wrappers: VueWrapper[] = [];
const mountPanel = (
  clip: Clip,
  options: { locked?: boolean; selectedIds?: string[]; additionalClips?: Clip[] } = {},
) => {
  const selectedCaptionClip = clip.kind === 'caption' ? clip : null;
  const selectedClip = clip.kind === 'caption' ? null : selectedClipProps(clip);
  const clips = [clip, ...(options.additionalClips ?? [])];
  const shapeLayers = clips.filter((candidate): candidate is ShapeClip => candidate.kind === 'shape');
  const { editor, remove } = createEditor(clip.kind === 'shape' ? clip : null, shapeLayers);
  const wrapper = mount(PropertiesPanel, {
    props: {
      ...baseProps,
      selectedClip,
      selectedCaptionClip,
      selectedClipIds: options.selectedIds ?? [clip.id],
      composition: compositionFor(...clips),
      ...(options.locked ? { lockedSelection: { clipIds: [clip.id], zoomIds: [] } } : {}),
    },
    global: {
      provide: { [ELEMENT_EDITOR]: editor },
      stubs: globalStubs,
    },
  });
  wrappers.push(wrapper);
  return { wrapper, remove };
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('PropertiesPanel Elements tab', () => {
  it('shows the tool catalog and selected shape properties without duplicating its generated panel', () => {
    const shape = makeShapeClip('selected-shape');
    const { wrapper } = mountPanel(shape);

    expect(
      wrapper
        .get('.element-tools')
        .findAll('button')
        .map((button) => button.text()),
    ).toEqual(['shape', 'arrow', 'text', 'drawing', 'title', 'blur', 'color', 'image']);
    expect(wrapper.find('[data-test="shape-layer-properties"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="generated-layer-properties"]').exists()).toBe(false);
  });

  it.each([
    { label: 'image', clip: makeImageClip('selected-image'), panel: 'clip-properties' },
    { label: 'color', clip: makeColorClip('selected-color'), panel: 'generated-layer-properties' },
    { label: 'blur', clip: makeBlurClip('selected-blur'), panel: 'blur-properties' },
    {
      label: 'manual caption',
      clip: makeManualCaption('selected-caption'),
      panel: 'caption-clip-properties',
    },
  ] satisfies Array<{ label: string; clip: Clip; panel: string }>)(
    'shows the Elements catalog beside selected $label properties',
    ({ clip, panel }) => {
      const { wrapper } = mountPanel(clip);

      expect(wrapper.find('.element-tools').exists()).toBe(true);
      expect(wrapper.find(`[data-test="${panel}"]`).exists()).toBe(true);
      expect(wrapper.get('.panel-title').text()).toBe('elements');
      expect(wrapper.find('button[aria-label="enabled"]').exists()).toBe(true);
      expect(wrapper.find('button[aria-label="clipTransitions"]').exists()).toBe(true);
      expect(wrapper.find('.properties-footer').exists()).toBe(true);
    },
  );

  it('keeps selection actions and transitions, and delegates deletion to the whole clip selection', async () => {
    const shape = makeShapeClip('selected-shape');
    const anotherShape = { ...makeShapeClip('another-selected-clip'), order: 1 };
    const { wrapper, remove } = mountPanel(shape, {
      selectedIds: [shape.id, anotherShape.id],
      additionalClips: [anotherShape],
    });

    await wrapper.get('button[aria-label="enabled"]').trigger('click');
    expect(wrapper.emitted('update:clip-enabled')).toEqual([[false]]);

    await wrapper.get('button[aria-label="clipTransitions"]').trigger('click');
    expect(wrapper.find('[data-test="clip-transitions-panel"]').exists()).toBe(true);

    await wrapper.get('.properties-footer button').trigger('click');
    expect(wrapper.emitted('delete-clip')).toEqual([[]]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps locked element properties guarded and prevents delete or toggle actions', async () => {
    const lockedColor = makeColorClip('locked-color', true);
    const { wrapper, remove } = mountPanel(lockedColor, { locked: true });

    expect(wrapper.get('.properties-lock-message').text()).toContain(
      'locked-color is locked. Modifications are not possible.',
    );
    expect(wrapper.get('.properties-lock-content').attributes('inert')).toBeDefined();
    expect(wrapper.find('button[aria-label="enabled"]').exists()).toBe(false);
    expect((wrapper.get('.properties-footer button').element as HTMLButtonElement).disabled).toBe(true);

    await wrapper.get('.properties-footer button').trigger('click');
    expect(wrapper.emitted('delete-clip')).toBeUndefined();
    expect(wrapper.emitted('update:clip-enabled')).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });
});
