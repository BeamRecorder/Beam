import { describe, expect, it } from 'vitest';
import { createElementText } from '@beam/engine/shared/element-text';
import { normalizeShapeLayerStyle } from '@beam/engine/shared/shape-layer-style';
import { emptyComposition, type ShapeClip } from '@beam/engine/shared/composition-types';
import { DEFAULT_OUTPUT_CANVAS } from '@beam/engine/layout/output-canvas';
import { createDefaultCursorPresentation } from '@beam/engine/capture/cursor-presentation';
import type { ProjectEditorState } from '~/api/types/capture-api';
import { defaultsFromEditorState, normalizeEditorPreferenceDefaults } from '../editor-defaults';

const state = (): ProjectEditorState => ({
  schemaVersion: 3,
  composition: emptyComposition(),
  zoom: { elements: [], generatedSessions: [] },
  presentation: {
    canvas: { ...DEFAULT_OUTPUT_CANVAS },
    selectedBackgroundId: null,
    background: null,
    blurPercent: 0,
    importedBackgrounds: [],
    cursor: createDefaultCursorPresentation(),
  },
});
const shape = (): ShapeClip => ({
  ...normalizeShapeLayerStyle({ family: 'shape' }),
  id: 'bubble',
  trackId: 'bubble',
  kind: 'shape',
  assetId: '',
  name: 'Speech bubble',
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 3000,
  sourceDurationMs: 3000,
  sourceInMs: 0,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  transform: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
});

describe('remembered shape typography', () => {
  it('captures the selected shape typography and restores it after serialization', () => {
    const clip = shape();
    clip.text = createElementText('Words from the previous recording');
    clip.text.style = {
      ...clip.text.style,
      color: '#000000',
      fontSize: 70,
      fontFamily: 'Inter',
      fontStyle: 'italic',
      customText: 'Do not save',
    };
    const saved = defaultsFromEditorState(normalizeEditorPreferenceDefaults(undefined), state(), clip, null);
    const restored = normalizeEditorPreferenceDefaults(JSON.parse(JSON.stringify(saved)));
    expect(restored.elementText?.style).toMatchObject({
      color: '#000000',
      fontSize: 70,
      fontFamily: 'Inter',
      fontStyle: 'italic',
    });
    expect(restored.elementText).not.toHaveProperty('content');
    expect(restored.elementText?.style).not.toHaveProperty('customText');
    restored.elementText!.style.shape.color = '#123456';
    expect(clip.text.style.shape.color).not.toBe('#123456');
  });

  it('keeps shape typography independent from caption preferences', () => {
    const captionStyle = createElementText().style;
    captionStyle.color = '#abcdef';
    const current = normalizeEditorPreferenceDefaults({ caption: { style: captionStyle, durationMs: 3000 } });
    const clip = shape();
    clip.text = createElementText('New shape');
    clip.text.style.color = '#000000';
    const saved = defaultsFromEditorState(current, state(), clip, null);
    expect(saved.caption?.style.color).toBe('#abcdef');
    expect(saved.elementText?.style.color).toBe('#000000');
  });

  it('does not reset the remembered style when a new empty shape or no clip is selected', () => {
    const text = createElementText();
    text.style.color = '#000000';
    const current = normalizeEditorPreferenceDefaults({ elementText: text });
    for (const clip of [shape(), null]) {
      expect(defaultsFromEditorState(current, state(), clip, null).elementText?.style.color).toBe('#000000');
    }
    const invalid = shape();
    invalid.text = { ...text, padding: 100 };
    expect(defaultsFromEditorState(current, state(), invalid, null).elementText?.style.color).toBe('#000000');
  });

  it('keeps old or invalid preferences usable without creating a fake typography default', () => {
    expect(normalizeEditorPreferenceDefaults({ schemaVersion: 1 })).not.toHaveProperty('elementText');
    expect(normalizeEditorPreferenceDefaults({ elementText: { style: { color: '#000000' } } })).not.toHaveProperty(
      'elementText',
    );
  });
});
