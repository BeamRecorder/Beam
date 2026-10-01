import { describe, expect, it } from 'vitest';
import { screenshotSearchPropertyAvailable } from '../screenshot-search-properties';
import { screenshotState } from '../../screenshot/screenshot-state';
import { documentFixture } from '../../screenshot/tests/screenshot-editor-test-helpers';
import { normalizeShapeLayerStyle } from '~/media/shared/shape-layer-style';
import { createElementText } from '~/media/shared/element-text';
import { createDefaultClipAppearance } from '~/media/shared/composition-defaults';
import type { EditorPropertyGroup } from '../editor-search-types';
import type { ShapeLayerFamily } from '~/media/shared/shape-layer-types';

const fixture = () => screenshotState(documentFixture());
const group = (namespace: string, tab = 'clip', section?: EditorPropertyGroup['section']): EditorPropertyGroup => ({
  namespace,
  tab,
  section,
  keys: [],
});

describe('screenshot property catalogue availability', () => {
  it('exposes real canvas and watermark controls only while their content is available', () => {
    const state = fixture(),
      canvas = group('CanvasPanel', 'canvas');
    expect(screenshotSearchPropertyAvailable(null, null, canvas, 'image')).toBe(false);
    for (const key of ['video', 'removeBackground'])
      expect(screenshotSearchPropertyAvailable(state, null, canvas, key)).toBe(false);
    state.canvas.showBackground = true;
    expect(screenshotSearchPropertyAvailable(state, null, canvas, 'backgroundType')).toBe(true);
    state.canvas.showBackground = false;
    expect(screenshotSearchPropertyAvailable(state, null, canvas, 'backgroundType')).toBe(false);
    expect(screenshotSearchPropertyAvailable(state, null, canvas, 'watermark')).toBe(true);
    for (const enabled of [false, true]) {
      state.canvas.watermark!.enabled = enabled;
      for (const key of ['watermarkText', 'showBeamLogo'])
        expect(screenshotSearchPropertyAvailable(state, null, canvas, key)).toBe(enabled);
    }
    for (const key of ['recorderTool', 'devToolsTool', 'themeMode'])
      expect(screenshotSearchPropertyAvailable(state, null, group('SettingsPanel'), key)).toBe(false);
    expect(screenshotSearchPropertyAvailable(state, null, group('SettingsPanel'), 'language')).toBe(true);
    expect(screenshotSearchPropertyAvailable(state, null, group('AppearanceSettings'), 'themeMode')).toBe(true);
  });

  it('omits video playback, hidden crop controls and invalid mirrored labels, while following image shadows', () => {
    const state = fixture(),
      clip = group('ClipPropertiesPanel'),
      id = state.image.id;
    expect(screenshotSearchPropertyAvailable(state, 'missing', clip, 'cornerRadius')).toBe(false);
    for (const key of ['speedBoost', 'playbackSpeed', 'crop', 'mirrorHorizontally', 'mirrorVertically'])
      expect(screenshotSearchPropertyAvailable(state, id, clip, key)).toBe(false);
    expect(screenshotSearchPropertyAvailable(state, id, clip, 'cornerRadius')).toBe(true);
    for (const shadowSize of ['none', 'md', 'custom'] as const) {
      state.image.appearance = { ...createDefaultClipAppearance('image'), shadowSize, shadowMode: 'solid' };
      expect(screenshotSearchPropertyAvailable(state, id, clip, 'shadowBlur')).toBe(shadowSize === 'custom');
      expect(screenshotSearchPropertyAvailable(state, id, clip, 'shadowColor')).toBe(shadowSize !== 'none');
      expect(screenshotSearchPropertyAvailable(state, id, clip, 'direction')).toBe(shadowSize !== 'none');
    }
    state.image.appearance = { ...createDefaultClipAppearance('image'), shadowSize: 'md', shadowMode: 'adaptive' };
    expect(screenshotSearchPropertyAvailable(state, id, clip, 'shadowColor')).toBe(false);
    state.image.appearance = createDefaultClipAppearance('image');
    expect(screenshotSearchPropertyAvailable(state, id, clip, 'shadowBlur')).toBe(false);
  });

  it.each<ShapeLayerFamily>(['shape', 'arrow', 'text', 'drawing'])(
    'indexes the actual %s controls, including conditional drawing, text and shadows',
    (family) => {
      const state = fixture();
      const shape = {
        ...state.image,
        kind: 'shape' as const,
        assetId: '',
        id: 'shape',
        ...normalizeShapeLayerStyle({ family }),
      };
      state.shapes = [shape];
      const available = (namespace: string, key: string, section?: EditorPropertyGroup['section']) =>
        screenshotSearchPropertyAvailable(state, shape.id, group(namespace, 'clip', section), key);
      for (const key of ['colorLayerOpacity', 'colorLayerCornerRadius', 'shapePreset'])
        expect(available('CanvasPanel', key)).toBe(false);
      expect(available('CanvasPanel', 'shapeFamily')).toBe(['shape', 'arrow'].includes(family));
      expect(available('CanvasPanel', 'shapeCornerRadius')).toBe(family === 'shape');
      if (family === 'shape') {
        shape.preset = 'ellipse';
        expect(available('CanvasPanel', 'shapeCornerRadius')).toBe(false);
      }
      expect(available('CanvasPanel', 'arrowThickness')).toBe(family === 'arrow');
      expect(available('CanvasPanel', 'fillColor')).toBe(!['text', 'drawing'].includes(family));
      expect(available('CanvasPanel', 'borderWidth')).toBe(family !== 'text');
      expect(available('CanvasPanel', 'shapeRotation')).toBe(true);
      for (const enabled of [true, false]) {
        state.shapes[0]!.shadowEnabled = enabled;
        state.shapes[0]!.opacityEnabled = enabled;
        expect(available('CanvasPanel', 'shadowBlur')).toBe(family !== 'text' && enabled);
        expect(available('CanvasPanel', 'colorLayerBackdropBlur')).toBe(
          !['text', 'drawing'].includes(family) && enabled,
        );
      }
      expect(available('Elements', 'editText', 'text')).toBe(false);
      expect(available('CaptionClipPanel', 'font')).toBe(false);
      state.shapes[0]!.text = createElementText('Searchable text');
      expect(available('Elements', 'editText', 'text')).toBe(true);
      expect(available('CaptionClipPanel', 'font')).toBe(true);
      expect(available('Elements', 'smoothing', 'appearance')).toBe(false);
      state.shapes[0]!.drawing = { points: [], smoothing: 50, strokeWidth: 5 };
      expect(available('Elements', 'smoothing', 'appearance')).toBe(true);
      expect(available('Elements', 'shapeLibrary', 'appearance')).toBe(false);
    },
  );

  it('only offers static cursor shadow controls when an actual cursor has its shadow enabled', () => {
    const state = fixture(),
      cursor = group('CursorPanel');
    expect(screenshotSearchPropertyAvailable(state, 'missing', cursor, 'cursorSize')).toBe(false);
    state.cursors = [
      {
        id: 'cursor',
        name: '',
        enabled: true,
        position: { x: 0, y: 0 },
        size: 32,
        rotation: 0,
        selection: { packId: 'builtin:macos', cursorId: 'default', mode: 'fixed' },
        color: '#ffffff',
        shadowEnabled: false,
        shadowBlur: 0,
        shadowColor: '#000000',
        shadowDirection: 'all',
      },
    ];
    expect(screenshotSearchPropertyAvailable(state, 'cursor', cursor, 'cursorSize')).toBe(true);
    for (const shadow of [false, true]) {
      state.cursors[0]!.shadowEnabled = shadow;
      expect(screenshotSearchPropertyAvailable(state, 'cursor', cursor, 'shadowBlur')).toBe(shadow);
    }
  });

  it.each(['blur', 'frosted', 'pixelated', 'opaque', 'highlight'] as const)(
    'indexes only the visible %s effect properties',
    (mode) => {
      const state = fixture();
      const effect = {
        ...state.image,
        kind: 'blur' as const,
        assetId: '',
        id: 'effect',
        mode,
        shape: 'rectangle' as const,
        strength: 50,
        feather: 0,
        tintOpacity: 0,
        color: '#000000',
      };
      state.effects = [effect];
      const available = (key: string) =>
        screenshotSearchPropertyAvailable(state, effect.id, group('BlurPropertiesPanel'), key);
      expect(screenshotSearchPropertyAvailable(state, 'missing', group('BlurPropertiesPanel'), 'mode')).toBe(false);
      expect(available('mode')).toBe(mode !== 'highlight');
      expect(available('strength')).toBe(false);
      expect(available('blurRadius')).toBe(mode === 'blur');
      expect(available('frostIntensity')).toBe(mode === 'frosted');
      expect(available('pixelSize')).toBe(mode === 'pixelated');
      expect(available('tintOpacity')).toBe(mode === 'frosted');
      expect(available('color')).toBe(['frosted', 'opaque'].includes(mode));
      expect(available('cornerRadius')).toBe(true);
      state.effects[0]!.shape = 'circle';
      expect(available('cornerRadius')).toBe(false);
      expect(available('feather')).toBe(true);
      expect(screenshotSearchPropertyAvailable(state, effect.id, group('Highlight'), 'highlightColor')).toBe(
        mode === 'highlight',
      );
    },
  );
});
